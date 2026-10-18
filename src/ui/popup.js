/**
 * DownWise popup — control center: active jobs, history, quick settings.
 */
import { getSettings, setSetting } from '../lib/settings.js';
import { ACTIVE_STATUSES } from '../lib/jobs.js';
import { setupPage, t } from '../i18n/index.js';
import { formatBytes, formatRelativeTime } from '../lib/format.js';
import { OUTPUT_FORMATS } from '../converters/registry.js';
import { CONVERSION_SIZE_LIMITS } from '../converters/index.js';
import { i18nKeyForCode } from '../lib/errors.js';
import { MSG } from '../lib/messages.js';
import { VERSION } from '../lib/branding.js';
import { icon, emptyIllustration } from './icons.js';
import { applyTheme, nextTheme } from './theme.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  settings: null,
  jobs: [],
  hostAccess: false,
  lang: 'fa',
  clearArmed: false,
};

/* ------------------------------------------------------------------ utils */

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  el.classList.remove('leaving');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); }, 250);
  }, 1900);
}

const kindIconName = { image: 'image', video: 'video', audio: 'audio', document: 'document', archive: 'archive', html: 'html', stream: 'stream', other: 'other' };

function statusInfo(job) {
  if (ACTIVE_STATUSES.includes(job.status)) {
    return { cls: 'active', label: t(state.lang, `status.${job.status}`), spin: true };
  }
  return { cls: job.status, label: t(state.lang, `status.${job.status}`) || job.status, spin: false };
}

/* ----------------------------------------------------------------- render */

function jobCard(job) {
  const lang = state.lang;
  const kind = job.kind || 'other';
  const targetLabel = job.target === 'original'
    ? t(lang, 'popup.originalTag')
    : (OUTPUT_FORMATS[job.target]?.label || job.target);

  const meta = [];
  meta.push(escapeHtml(targetLabel));
  meta.push(escapeHtml(t(lang, `kind.${kind}`)));
  if (job.info?.width && job.info?.height) {
    meta.push(`${job.info.width}×${job.info.height}`);
  } else if (job.info?.durationSec) {
    const m = Math.floor(job.info.durationSec / 60);
    const s = String(Math.round(job.info.durationSec % 60)).padStart(2, '0');
    meta.push(`${m}:${s}`);
  }
  if (job.size) meta.push(escapeHtml(formatBytes(job.size, lang)));
  meta.push(escapeHtml(formatRelativeTime(job.finishedAt || job.updatedAt || job.createdAt, lang)));

  const showProgress = ['fetching', 'converting', 'saving', 'preparing', 'downloading', 'queued'].includes(job.status);
  const pct = job.progress;
  const progressRow = showProgress
    ? `<div class="job-progress-row">
         <div class="progress"><div class="progress-fill${pct == null ? ' indeterminate' : ''}" style="width:${pct == null ? 34 : pct}%"></div></div>
         <span class="job-progress-label num">${pct == null ? '' : `${pct}%`}</span>
       </div>`
    : '';

  const errorRow = job.status === 'failed' && job.errorCode
    ? `<div class="job-error"><span class="err-icon">${icon('alert', { size: 13 })}</span>
         <span>${escapeHtml(t(lang, i18nKeyForCode(job.errorCode), {
           status: job.errorStatus ?? '',
           limit: formatBytes(CONVERSION_SIZE_LIMITS[job.kind] || CONVERSION_SIZE_LIMITS.image, lang),
         }))}</span>
       </div>`
    : '';

  const noteRow = job.note
    ? `<div class="job-note">${escapeHtml(t(lang, job.note))}</div>`
    : '';

  const grantRow = job.status === 'action_required'
    ? `<button class="btn btn-primary grant-inline" data-act="grant" style="margin-top:8px;padding:6px 14px;font-size:12px;">
         ${icon('shieldCheck', { size: 14 })}${escapeHtml(t(lang, 'popup.grantAccess'))}
       </button>`
    : '';

  const actions = [];
  if (job.status === 'failed' || job.status === 'canceled') {
    actions.push(`<button class="icon-btn" data-act="retry" data-id="${job.id}" title="${escapeHtml(t(lang, 'popup.retry'))}" aria-label="${escapeHtml(t(lang, 'popup.retry'))}">${icon('refresh', { size: 15 })}</button>`);
  }
  if (job.downloadId != null && job.status === 'completed') {
    actions.push(`<button class="icon-btn" data-act="show" data-id="${job.id}" title="${escapeHtml(t(lang, 'popup.showFolder'))}" aria-label="${escapeHtml(t(lang, 'popup.showFolder'))}">${icon('folder', { size: 15 })}</button>`);
  }
  if (!['fetching', 'converting', 'saving', 'downloading'].includes(job.status)) {
    actions.push(`<button class="icon-btn" data-act="remove" data-id="${job.id}" title="${escapeHtml(t(lang, 'popup.remove'))}" aria-label="${escapeHtml(t(lang, 'popup.remove'))}">${icon('x', { size: 15 })}</button>`);
  }

  const status = statusInfo(job);
  const statusBadge = (status.cls === 'completed' || status.cls === 'canceled' || status.cls === 'active')
    ? `<span class="status-badge ${status.cls}">${status.spin ? icon('refresh', { size: 10, cls: 'spin' }) : (status.cls === 'completed' ? icon('check', { size: 10 }) : '')}${escapeHtml(status.label)}</span>`
    : '';

  return `<article class="job enter" data-status="${job.status}" data-job="${job.id}">
    <span class="job-icon kind-${kind}">${icon(kindIconName[kind] || 'other', { size: 17 })}</span>
    <div class="job-main">
      <div class="job-top">
        <span class="job-name" title="${escapeHtml(job.name)}">${escapeHtml(job.name)}</span>
        ${statusBadge}
      </div>
      <div class="job-meta">${meta.join('<span class="dot">·</span>')}</div>
      ${progressRow}
      ${errorRow}
      ${noteRow}
      ${grantRow}
    </div>
    <div class="job-actions">${actions.join('')}</div>
  </article>`;
}

function render() {
  const lang = state.lang;
  const active = state.jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const finished = state.jobs.filter((j) => !ACTIVE_STATUSES.includes(j.status)).slice(0, 20);

  // permission chip
  const chip = $('#perm-chip');
  if (state.hostAccess) {
    chip.hidden = false;
    chip.classList.add('ok');
    chip.classList.remove('warn');
    chip.innerHTML = `<span class="chip-icon">${icon('shieldCheck', { size: 15 })}</span>
      <span class="chip-text"><span class="chip-title">${escapeHtml(t(lang, 'popup.fullAccess'))}</span>
      <span class="chip-sub"> ${escapeHtml(t(lang, 'popup.fullAccessHint'))}</span></span>`;
  } else {
    chip.hidden = false;
    chip.classList.add('warn');
    chip.classList.remove('ok');
    chip.innerHTML = `<span class="chip-icon">${icon('shield', { size: 15 })}</span>
      <span class="chip-text"><span class="chip-title">${escapeHtml(t(lang, 'popup.restrictedMode'))}</span>
      <span class="chip-sub"> ${escapeHtml(t(lang, 'popup.restrictedHint'))}</span></span>
      <span style="margin-inline-start:auto">${icon('zap', { size: 14 })}</span>`;
  }

  // active panel
  const activePanel = $('#active-panel');
  activePanel.hidden = active.length === 0;
  $('#active-count').hidden = active.length === 0;
  $('#active-count').textContent = String(active.length);
  $('#active-list').innerHTML = active.map(jobCard).join('');

  // history panel
  $('#history-list').innerHTML = finished.map(jobCard).join('');
  $('#empty-state').classList.toggle('visible', finished.length === 0);
}

function renderThemeIcon() {
  const theme = state.settings?.theme || 'auto';
  const name = theme === 'auto' ? 'contrast' : theme === 'light' ? 'sun' : 'moon';
  $('#btn-theme').innerHTML = icon(name, { size: 17 });
}

function renderLangLabel() {
  $('#lang-label').textContent = state.lang === 'fa' ? 'EN' : 'فا';
}

/* ------------------------------------------------------------------ state */

async function loadState() {
  try {
    const res = await chrome.runtime.sendMessage({ type: MSG.GET_STATE });
    if (res?.ok) {
      state.jobs = res.jobs || [];
      state.hostAccess = Boolean(res.hostAccess);
    }
  } catch { /* SW may be asleep; it will wake and broadcast */ }
  render();
}

function subscribe() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === MSG.JOBS_UPDATED && Array.isArray(msg.jobs)) {
      state.jobs = msg.jobs;
      render();
    }
  });
}

/* ------------------------------------------------------------------ boot */

function bind() {
  $('#btn-theme').addEventListener('click', async () => {
    const next = nextTheme(state.settings.theme);
    state.settings.theme = next;
    applyTheme(next);
    renderThemeIcon();
    await setSetting('theme', next);
  });

  $('#btn-lang').addEventListener('click', async () => {
    const next = state.lang === 'fa' ? 'en' : 'fa';
    state.lang = next;
    state.settings.language = next;
    setupPage(document, next);
    renderLangLabel();
    renderThemeIcon();
    render();
    await setSetting('language', next);
  });

  $('#btn-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  $('#btn-clear').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!state.clearArmed) {
      state.clearArmed = true;
      btn.textContent = t(state.lang, 'popup.clearYes');
      setTimeout(() => {
        state.clearArmed = false;
        btn.textContent = t(state.lang, 'popup.clearAll');
      }, 2600);
      return;
    }
    state.clearArmed = false;
    btn.textContent = t(state.lang, 'popup.clearAll');
    try {
      await chrome.runtime.sendMessage({ type: MSG.CLEAR_HISTORY });
      toast(t(state.lang, 'popup.toastCleared'));
    } catch { /* ignore */ }
  });

  $('#perm-chip').addEventListener('click', async () => {
    if (state.hostAccess) return;
    try {
      const granted = await chrome.permissions.request({ origins: ['*://*/*'] });
      if (granted) {
        state.hostAccess = true;
        render();
        toast(t(state.lang, 'popup.toastAccessGranted'));
      } else {
        toast(t(state.lang, 'popup.toastAccessFailed'));
      }
    } catch {
      toast(t(state.lang, 'popup.toastAccessFailed'));
    }
  });

  // delegated job actions
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'retry') {
      btn.disabled = true;
      try { await chrome.runtime.sendMessage({ type: MSG.RETRY, jobId: id }); } catch { /* ignore */ }
    } else if (act === 'show') {
      const job = state.jobs.find((j) => j.id === id);
      if (job?.downloadId != null) chrome.downloads.show(job.downloadId);
    } else if (act === 'remove') {
      try { await chrome.runtime.sendMessage({ type: MSG.REMOVE_JOB, jobId: id }); } catch { /* ignore */ }
    } else if (act === 'grant') {
      try {
        const granted = await chrome.permissions.request({ origins: ['*://*/*'] });
        if (granted) {
          state.hostAccess = true;
          toast(t(state.lang, 'popup.toastAccessGranted'));
          try { await chrome.runtime.sendMessage({ type: MSG.RETRY, jobId: btn.closest('[data-job]')?.dataset.job }); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
  });

  // refresh relative times periodically
  setInterval(() => {
    if (state.jobs.length) render();
  }, 45000);
}

async function init() {
  state.settings = await getSettings();
  state.lang = state.settings.language;
  applyTheme(state.settings.theme);

  setupPage(document, state.lang);
  $('#empty-art').innerHTML = emptyIllustration();
  $('#options-icon').innerHTML = icon('settings', { size: 15 });
  $('#version-label').textContent = `v${VERSION}`;

  renderThemeIcon();
  renderLangLabel();
  bind();
  subscribe();
  await loadState();
}

init().catch((err) => {
  console.error('DownWise popup init failed:', err);
  document.body.insertAdjacentHTML('afterbegin',
    `<div class="toast" role="alert">DownWise: ${escapeHtml(err?.message || 'init error')}</div>`);
});
