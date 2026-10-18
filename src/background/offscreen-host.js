/**
 * Service-worker side of the offscreen document (MV3 chrome.offscreen API).
 * Lazily creates the document when SVG rasterization, audio decoding or
 * video frame capture is needed, then exchanges base64 payloads with it.
 *
 * Memory-leak guard: the document is a costly context (a whole renderer
 * process), so it is closed automatically after IDLE_CLOSE_MS without work —
 * work means in-flight conversion calls AND downloads still reading a blob
 * URL created inside the document.
 */
import { DownWiseError } from '../lib/errors.js';
import { bytesToBase64 } from '../lib/base64.js';
import { MSG } from '../lib/messages.js';
import { blobUrlQueue } from '../lib/task-queue.js';
import { hasLiveBlobs, trackBlobUrl } from './blob-urls.js';

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
export const IDLE_CLOSE_MS = 30_000; // auto-close when idle

let creating = null;
let inFlight = 0;
let idleTimer = null;

function offscreenApi() {
  if (typeof chrome === 'undefined' || !chrome?.offscreen || !chrome?.runtime?.getContexts) {
    throw new DownWiseError('OFFSCREEN_FAILED', { message: 'chrome.offscreen unavailable' });
  }
  return chrome.offscreen;
}

async function hasOffscreenDocument() {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    return Boolean(contexts && contexts.length > 0);
  } catch {
    return false;
  }
}

export async function ensureOffscreen() {
  const api = offscreenApi();
  armIdleClose(); // creating/using the doc postpones any pending close
  if (await hasOffscreenDocument()) return;
  if (!creating) {
    creating = api.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['DOM_PARSER', 'AUDIO_PLAYBACK', 'VIDEO_PLAYBACK'],
      justification: 'Rasterize SVG, decode audio and capture a video frame for real format conversion.',
    }).finally(() => { creating = null; });
  }
  await creating;
}

/** Only auto-close when nothing is running and no download depends on us. */
async function isIdle() {
  return inFlight === 0 && !hasLiveBlobs();
}

/** (Re)start the idle countdown. Safe to call any time. */
export function armIdleClose(delayMs = IDLE_CLOSE_MS) {
  if (typeof setTimeout !== 'function') return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    closeOffscreenIfIdle().catch(() => {});
  }, delayMs);
}

/**
 * Close the offscreen document when idle. Returns true when it was closed.
 * Exported for tests and for chrome.runtime.onSuspend cleanup.
 */
export async function closeOffscreenIfIdle() {
  if (typeof chrome === 'undefined' || !chrome?.offscreen?.closeDocument) return false;
  if (!(await isIdle())) return false;
  if (!(await hasOffscreenDocument())) return false;
  try {
    await chrome.offscreen.closeDocument();
    return true;
  } catch {
    return false; // already gone
  }
}

/** Round-trip a request to the offscreen document with a timeout. */
export function callOffscreen(payload, { timeoutMs = 180000 } = {}) {
  const request = (async () => {
    await ensureOffscreen();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new DownWiseError('OFFSCREEN_FAILED', { message: 'offscreen timeout' })),
        timeoutMs,
      );
      chrome.runtime.sendMessage(payload)
        .then((res) => {
          clearTimeout(timer);
          if (res && res.ok) resolve(res);
          else reject(new DownWiseError(res?.code || 'OFFSCREEN_FAILED', { message: res?.message }));
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(new DownWiseError('OFFSCREEN_FAILED', { message: err?.message || 'no offscreen response' }));
        });
    });
  })();

  // Track in-flight work so the idle closer never races a running task.
  inFlight += 1;
  return request
    .finally(() => {
      inFlight -= 1;
      armIdleClose();
    });
}

export async function withOffscreen(payload) {
  return callOffscreen(payload);
}

/**
 * Create a downloadable blob URL for converted bytes.
 * Primary: offscreen document (works for large payloads).
 * Fallback: inline data: URL (works everywhere, heavier for big files).
 * Serialized through blobUrlQueue so parallel conversions don't boot the
 * offscreen document several times.
 * @returns {{ url: string, kind: 'blob' | 'data' }}
 */
export async function makeBlobUrl(bytes, mime) {
  const entry = await blobUrlQueue.run(async () => {
    try {
      const res = await callOffscreen({
        type: MSG.OFFSCREEN_MAKE_BLOB_URL,
        base64: bytesToBase64(bytes),
        mime: mime || 'application/octet-stream',
      });
      return { url: res.url, kind: 'blob' };
    } catch {
      return {
        url: `data:${mime || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`,
        kind: 'data',
      };
    }
  });
  if (entry.kind === 'blob') trackBlobUrl(entry);
  return entry;
}

/** Free the blob URL created in the offscreen document (data: needs nothing). */
export async function revokeBlobUrl(entry) {
  if (!entry || entry.kind !== 'blob') return;
  try {
    await chrome.runtime.sendMessage({ type: MSG.OFFSCREEN_REVOKE_BLOB_URL, url: entry.url });
  } catch { /* offscreen already gone — closing the doc revokes its URLs */ }
}

/**
 * Release everything the offscreen document still holds and close it.
 * Called from chrome.runtime.onSuspend as a last-resort sweep.
 */
export async function teardownOffscreen() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (inFlight > 0 || hasLiveBlobs()) return; // downloads still depend on it
  try {
    if (await hasOffscreenDocument()) await chrome.offscreen.closeDocument();
  } catch { /* ignore */ }
}
