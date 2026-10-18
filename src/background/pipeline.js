/**
 * The job pipeline: context-menu click → fetch (guarded) → optional real
 * conversion → chrome.downloads. Handles HTML-response recovery, page-context
 * fallbacks, permission UX, progress, badges and notifications.
 */
import {
  createJob, updateJob, getJob, listJobs, broadcastJobs, ACTIVE_STATUSES,
} from '../lib/jobs.js';
import { getSettings } from '../lib/settings.js';
import { baseNameFromUrl, sanitizeFilename, replaceExtension } from '../lib/filename.js';
import {
  mimeFromExt, kindFromMime, extFromUrl, isStreamManifestUrl, supportedScheme,
} from '../lib/mime.js';
import { sniffType } from '../lib/sniff.js';
import { DownWiseError, toDownWiseError, i18nKeyForCode } from '../lib/errors.js';
import { t } from '../i18n/index.js';
import { formatBytes } from '../lib/format.js';
import { base64ToBytes } from '../lib/base64.js';
import { fetchResource, probeResource, hasHostAccess } from './fetcher.js';
import { findPageCandidates, pageFetch } from './recovery.js';
import { makeBlobUrl, revokeBlobUrl } from './offscreen-host.js';
import { convertFile, CONVERSION_SIZE_LIMITS } from '../converters/index.js';
import { OUTPUT_FORMATS } from '../converters/registry.js';

const ICON_URL = 'assets/icons/icon-128.png';
const BADGE_COUNT_COLOR = '#0D9488';
const BADGE_OK_COLOR = '#10B981';
const BADGE_FAIL_COLOR = '#F43F5E';

const blobUrlsByDownload = new Map(); // downloadId → { url, kind } entry to revoke
const notifToDownload = new Map();    // notificationId → downloadId

/* ------------------------------------------------------------------ badge */

async function updateBadge() {
  if (typeof chrome === 'undefined' || !chrome?.action) return;
  try {
    const jobs = await listJobs();
    const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length;
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COUNT_COLOR });
    await chrome.action.setBadgeText({ text: active > 0 ? String(Math.min(active, 99)) : '' });
  } catch { /* ignore */ }
}

async function flashBadge(kind) {
  if (typeof chrome === 'undefined' || !chrome?.action) return;
  try {
    await chrome.action.setBadgeBackgroundColor({ color: kind === 'ok' ? BADGE_OK_COLOR : BADGE_FAIL_COLOR });
    await chrome.action.setBadgeText({ text: kind === 'ok' ? '✓' : '!' });
    setTimeout(() => { updateBadge(); }, kind === 'ok' ? 2500 : 4000);
  } catch { /* ignore */ }
}

/* ----------------------------------------------------------- notifications */

function notifIcon() {
  try { return chrome.runtime.getURL(ICON_URL); } catch { return ICON_URL; }
}

async function notify(lang, settings, { title, message, downloadId = null }) {
  if (!settings?.notifications || typeof chrome === 'undefined' || !chrome?.notifications) return;
  const id = `dw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (downloadId != null) notifToDownload.set(id, downloadId);
  chrome.notifications.create(id, { type: 'basic', iconUrl: notifIcon(), title, message });
}

function failureParams(err, job, lang) {
  const cap = CONVERSION_SIZE_LIMITS[job?.kind] || CONVERSION_SIZE_LIMITS.image;
  return {
    status: err?.status != null ? String(err.status) : '',
    limit: formatBytes(cap, lang),
  };
}

async function notifyFailure(job, err, lang, settings) {
  await notify(lang, settings, {
    title: t(lang, 'notify.failTitle'),
    message: t(lang, 'notify.failBody', {
      name: job?.name || '',
      reason: t(lang, i18nKeyForCode(err.code), failureParams(err, job, lang)),
    }),
  });
}

function registerNotificationClicks() {
  if (typeof chrome === 'undefined' || !chrome?.notifications?.onClicked) return;
  chrome.notifications.onClicked.addListener((notifId) => {
    const downloadId = notifToDownload.get(notifId);
    if (downloadId != null && chrome.downloads?.show) {
      chrome.downloads.show(downloadId);
      notifToDownload.delete(notifId);
    }
  });
}

/* --------------------------------------------------------------- progress */

function progressReporter(jobId) {
  let last = 0;
  return (received, total) => {
    const now = Date.now();
    if (now - last < 300) return;
    last = now;
    const pct = total ? Math.min(99, Math.round((received / total) * 100)) : null;
    updateJob(jobId, { status: 'fetching', progress: pct }).then(broadcastJobs).catch(() => {});
  };
}

/* ------------------------------------------------------------ entry point */

export async function handleMenuClick(info, tab, action) {
  const url = info.srcUrl || info.linkUrl || '';
  if (!url) return;

  const settings = await getSettings();
  const lang = settings.language;

  const mediaKind = ['image', 'video', 'audio'].includes(info.mediaType) ? info.mediaType : null;
  const guessedKind = mediaKind || kindFromMime(mimeFromExt(extFromUrl(url))) || 'other';

  const bailOut = async (code) => {
    const job = await createJob({
      url,
      name: sanitizeFilename(baseNameFromUrl(url)),
      kind: guessedKind,
      target: action.target,
      status: 'failed',
      errorCode: code,
      finishedAt: Date.now(),
    });
    await broadcastJobs();
    await updateBadge();
    await notifyFailure(job, new DownWiseError(code), lang, settings);
    await flashBadge('fail');
    return job;
  };

  if (!supportedScheme(url)) { await bailOut('UNSUPPORTED_SCHEME'); return; }
  if (isStreamManifestUrl(url)) { await bailOut('UNSUPPORTED_STREAM'); return; }

  const job = await createJob({
    url,
    name: sanitizeFilename(baseNameFromUrl(url)),
    kind: guessedKind,
    target: action.target,
    status: 'queued',
    context: { tabId: tab?.id ?? null, frameId: Number.isInteger(info.frameId) ? info.frameId : null },
  });
  await broadcastJobs();
  await updateBadge();
  void runJob(job.id);
}

export async function retryJob(jobId) {
  const job = await getJob(jobId);
  if (!job) return false;
  // Retry is for finished jobs AND permission-blocked jobs (after granting
  // access from the popup). Actively-processing jobs cannot be re-queued.
  const busy = ['queued', 'preparing', 'fetching', 'converting', 'saving', 'downloading'];
  if (busy.includes(job.status)) return false;
  await updateJob(jobId, { status: 'queued', progress: 0, errorCode: null, errorStatus: null, finishedAt: null });
  void runJob(jobId);
  return true;
}

async function runJob(jobId) {
  let job = await getJob(jobId);
  if (!job) return;
  const settings = await getSettings();
  const lang = settings.language;
  try {
    await updateJob(jobId, { status: 'preparing', progress: null, errorCode: null });
    await broadcastJobs();
    if (job.target === 'original') await runOriginal(job);
    else await runConversion(job, settings, lang);
  } catch (err) {
    const e = toDownWiseError(err);
    job = await getJob(jobId);
    await updateJob(jobId, { status: 'failed', errorCode: e.code, errorStatus: e.status ?? null, progress: null });
    await notifyFailure(job, e, lang, settings);
    await flashBadge('fail');
  } finally {
    await broadcastJobs();
    await updateBadge();
  }
}

/* ------------------------------------------------------- original downloads */

async function directDownload(job, url) {
  await updateJob(job.id, { status: 'downloading', progress: null });
  const downloadId = await chrome.downloads.download({
    url,
    filename: job.name || undefined,
    conflictAction: 'uniquify',
  });
  await trackDownload(job.id, downloadId);
  return { downloadId };
}

/**
 * Persist the downloadId and reconcile with the download's CURRENT state —
 * tiny payloads can complete before the onChanged handler sees our job.
 */
async function trackDownload(jobId, downloadId) {
  await updateJob(jobId, { downloadId });
  let item = null;
  try { [item] = await chrome.downloads.search({ id: downloadId }); } catch { /* gone */ }
  if (!item) return;
  if (item.state === 'complete') {
    await finalizeCompleted(jobId, downloadId);
  } else if (item.state === 'interrupted') {
    await updateJob(jobId, { status: 'failed', errorCode: 'DOWNLOAD_FAILED', progress: null });
  } else {
    // still in progress — set 'downloading' unless a terminal state landed first
    await setDownloadingUnlessFinal(jobId, downloadId);
  }
}

async function setDownloadingUnlessFinal(jobId, downloadId) {
  const current = await getJob(jobId);
  if (!current || ['completed', 'failed', 'canceled'].includes(current.status)) return;
  await updateJob(jobId, { downloadId, status: 'downloading' });
}

/** Shared completion logic (used by onChanged and trackDownload). */
async function finalizeCompleted(jobId, downloadId) {
  const saved = blobUrlsByDownload.get(downloadId);
  if (saved) {
    await revokeBlobUrl(saved);
    blobUrlsByDownload.delete(downloadId);
  }
  const job = await getJob(jobId);
  if (!job || ['completed', 'failed', 'canceled'].includes(job.status)) return;
  let item = null;
  try { [item] = await chrome.downloads.search({ id: downloadId }); } catch { /* ignore */ }
  await updateJob(job.id, {
    status: 'completed',
    progress: 100,
    size: item?.fileSize ?? job.size ?? null,
    finishedAt: Date.now(),
  });
  const settings = await getSettings();
  const fresh = await getJob(job.id);
  await notify(settings.language, settings, {
    title: t(settings.language, 'notify.doneTitle'),
    message: t(settings.language, 'notify.doneBody', { name: fresh?.name || job.name }),
    downloadId,
  });
  await flashBadge('ok');
  await broadcastJobs();
  await updateBadge();
}

async function runOriginal(job) {
  const { tabId, frameId } = job.context || {};
  let url = job.url;

  // data:/blob: URLs cannot be probed from the worker — download directly.
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    await directDownload(job, url);
    return;
  }

  await updateJob(job.id, { status: 'fetching', progress: null });
  await broadcastJobs();
  let probe = await probeResource(url);

  if (probe.html) {
    const candidates = await findPageCandidates(tabId, frameId, job.kind, url);
    let recovered = null;
    for (const candidate of candidates.slice(0, 3)) {
      const p2 = await probeResource(candidate);
      if (p2.reachable && !p2.html && p2.sniffed?.kind !== 'html') {
        recovered = { url: candidate, probe: p2 };
        break;
      }
    }
    if (!recovered) {
      throw new DownWiseError(candidates.length ? 'RECOVERY_FAILED' : 'HTML_RESPONSE', { url });
    }
    url = recovered.url;
    probe = recovered.probe;
    await updateJob(job.id, { url, name: sanitizeFilename(baseNameFromUrl(url)) });
  }

  if (probe.sniffed?.kind === 'stream' || isStreamManifestUrl(url)) {
    throw new DownWiseError('UNSUPPORTED_STREAM', { url });
  }

  // Enrich UI info when type was detected
  if (probe.sniffed) {
    await updateJob(job.id, { kind: probe.sniffed.kind, mime: probe.sniffed.mime });
  }

  const fresh = (await getJob(job.id)) || job; // pick up recovered name/url
  await directDownload(fresh, url);
}

/* ----------------------------------------------------------- conversions */

async function recoverAndFetch(job, kind, onProgress) {
  const { tabId, frameId } = job.context || {};
  const candidates = await findPageCandidates(tabId, frameId, kind, job.url);
  for (const candidate of candidates.slice(0, 2)) {
    try {
      const r = await fetchResource(candidate, { onProgress });
      await updateJob(job.id, {
        url: candidate,
        name: sanitizeFilename(baseNameFromUrl(candidate)),
      });
      return r;
    } catch { /* try next candidate */ }
  }
  throw new DownWiseError(candidates.length ? 'RECOVERY_FAILED' : 'HTML_RESPONSE', { url: job.url });
}

async function runConversion(job, settings, lang) {
  const { tabId, frameId } = job.context || {};
  const fmt = OUTPUT_FORMATS[job.target];
  let bytes;
  let mime = '';
  let sniffed = null;
  let finalUrl = job.url;

  if (job.url.startsWith('blob:')) {
    await updateJob(job.id, { status: 'fetching', progress: null });
    await broadcastJobs();
    try {
      const r = await pageFetch(tabId, frameId, job.url);
      bytes = base64ToBytes(r.base64);
      mime = r.mime || '';
      finalUrl = r.finalUrl || job.url;
    } catch (err) {
      // MSE MediaSource blobs and cross-origin blobs cannot be re-fetched.
      if (toDownWiseError(err).code === 'FILE_TOO_LARGE') throw err;
      throw new DownWiseError('UNSUPPORTED_STREAM', { url: job.url });
    }
  } else {
    await updateJob(job.id, { status: 'fetching', progress: 0 });
    await broadcastJobs();
    try {
      const r = await fetchResource(job.url, { onProgress: progressReporter(job.id) });
      bytes = r.bytes; mime = r.mime; sniffed = r.sniffed; finalUrl = r.finalUrl;
    } catch (err) {
      const e = toDownWiseError(err);
      if (e.code === 'HTML_RESPONSE') {
        ({ bytes, mime, sniffed, finalUrl } = await recoverAndFetch(job, job.kind, progressReporter(job.id)));
      } else if (e.code === 'CORS') {
        try {
          const r = await pageFetch(tabId, frameId, job.url);
          bytes = base64ToBytes(r.base64); mime = r.mime || ''; finalUrl = r.finalUrl || job.url;
        } catch {
          const access = await hasHostAccess(job.url);
          if (!access) {
            await updateJob(job.id, { status: 'action_required', errorCode: 'PERMISSION_REQUIRED', progress: null });
            await notify(lang, settings, { title: t(lang, 'notify.permTitle'), message: t(lang, 'notify.permBody') });
            await flashBadge('fail');
            await broadcastJobs();
            return;
          }
          throw e;
        }
      } else {
        throw e;
      }
    }
  }

  sniffed = sniffed || sniffType(bytes.subarray(0, Math.min(bytes.length, 1024)));
  const sourceKind = sniffed?.kind || kindFromMime(mime) || 'other';
  const sourceMime = sniffed?.mime || mime || 'application/octet-stream';

  if (sourceKind === 'stream') throw new DownWiseError('UNSUPPORTED_STREAM', { url: finalUrl });
  if (fmt.kind === 'image' && sourceKind !== 'image') throw new DownWiseError('KIND_MISMATCH', { url: finalUrl });
  if (fmt.kind === 'audio' && sourceKind !== 'audio') throw new DownWiseError('KIND_MISMATCH', { url: finalUrl });

  const cap = CONVERSION_SIZE_LIMITS[sourceKind] || CONVERSION_SIZE_LIMITS.image;
  if (bytes.length > cap) throw new DownWiseError('TOO_LARGE_FOR_CONVERSION', { url: finalUrl });

  await updateJob(job.id, {
    status: 'converting',
    progress: null,
    kind: sourceKind,
    mime: sourceMime,
    size: bytes.length,
  });
  await broadcastJobs();

  const out = await convertFile(
    bytes,
    { mime: sourceMime, kind: sourceKind, isSvg: sniffed?.ext === 'svg' },
    job.target,
    { quality: settings.quality },
  );

  let note = null;
  if (sniffed?.ext === 'gif') note = 'notes.animatedImage';
  else if (job.target === 'jpeg' && ['png', 'webp', 'svg'].includes(sniffed?.ext)) note = 'notes.jpegFlatten';

  const filename = sanitizeFilename(replaceExtension(baseNameFromUrl(finalUrl), fmt.ext));

  await updateJob(job.id, {
    status: 'saving',
    progress: 100,
    name: filename,
    size: out.bytes.byteLength,
    info: out.info || null,
    note,
  });
  await broadcastJobs();

  // URL.createObjectURL is unavailable in service workers — the offscreen
  // document creates the blob URL (data: URL as a graceful fallback).
  const saved = await makeBlobUrl(out.bytes, out.mime);
  let downloadId;
  try {
    downloadId = await chrome.downloads.download({
      url: saved.url,
      filename,
      conflictAction: 'uniquify',
    });
  } catch (err) {
    await revokeBlobUrl(saved); // don't leak the offscreen blob URL
    throw err;
  }
  if (saved.kind === 'blob') blobUrlsByDownload.set(downloadId, saved);
  await trackDownload(job.id, downloadId);
  await broadcastJobs();
}

/* ------------------------------------------------------- download watching */

async function findJobByDownloadId(downloadId) {
  const jobs = await listJobs();
  return jobs.find((j) => j.downloadId === downloadId) || null;
}

export function registerDownloadWatchers() {
  if (typeof chrome === 'undefined' || !chrome?.downloads?.onChanged) return;
  chrome.downloads.onChanged.addListener(async (delta) => {
    if (!delta.state) return;
    const job = await findJobByDownloadId(delta.id);
    if (!job || ['completed', 'failed', 'canceled'].includes(job.status)) return;

    if (delta.state.current === 'complete') {
      await finalizeCompleted(job.id, delta.id);
    } else if (delta.state.current === 'interrupted') {
      const saved = blobUrlsByDownload.get(delta.id);
      if (saved) {
        await revokeBlobUrl(saved);
        blobUrlsByDownload.delete(delta.id);
      }
      const canceled = delta.error?.current === 'USER_CANCELED';
      await updateJob(job.id, {
        status: canceled ? 'canceled' : 'failed',
        errorCode: canceled ? null : 'DOWNLOAD_FAILED',
        errorStatus: null,
        progress: null,
      });
      if (!canceled) {
        const settings = await getSettings();
        await notifyFailure(job, new DownWiseError('DOWNLOAD_FAILED'), settings.language, settings);
        await flashBadge('fail');
      }
      await broadcastJobs();
      await updateBadge();
    }
  });
}

export { registerNotificationClicks, updateBadge };
