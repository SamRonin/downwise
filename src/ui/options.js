/**
 * DownWise options page — instant-apply settings, permission management.
 */
import { getSettings, setSetting } from '../lib/settings.js';
import { setupPage, t } from '../i18n/index.js';
import { listJobs, ACTIVE_STATUSES } from '../lib/jobs.js';
import { icon } from './icons.js';
import { applyTheme } from './theme.js';
import { VERSION, REPO_URL, ISSUES_URL, PRIVACY_URL } from '../lib/branding.js';

const $ = (sel) => document.querySelector(sel);

const state = { settings: null, lang: 'fa' };

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1500);
}

/* ------------------------------------------------------------ navigation */

function showSection(id) {
  document.querySelectorAll('.section').forEach((s) => { s.hidden = s.id !== `section-${id}`; });
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.section === id);
  });
}

function bindNav() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });
}

/* --------------------------------------------------------------- controls */

function renderThemeChoice() {
  document.querySelectorAll('.theme-card').forEach((c) => {
    c.classList.toggle('selected', c.dataset.themeChoice === state.settings.theme);
  });
}

function renderLangChoice() {
  document.querySelectorAll('.lang-card').forEach((c) => {
    c.classList.toggle('selected', c.dataset.langChoice === state.lang);
  });
}

function renderQuality() {
  const range = $('#quality-range');
  const val = Math.round(state.settings.quality * 100);
  range.value = String(val);
  $('#quality-output').textContent = `${val}%`;
  const pct = ((val - 50) / 50) * 100;
  range.style.setProperty('--slider-fill', `${pct}%`);
  // RTL gradient direction flip
  const rtl = document.documentElement.dir === 'rtl';
  range.style.setProperty('--slider-dir', rtl ? 'left' : 'right');
}

async function renderPermissions() {
  let granted = false;
  try {
    granted = await chrome.permissions.contains({ origins: ['*://*/*'] });
  } catch { /* ignore */ }

  const card = $('#perm-card');
  card.classList.toggle('ok', granted);
  card.classList.toggle('warn', !granted);
  $('#perm-card-icon').innerHTML = icon(granted ? 'shieldCheck' : 'shield', { size: 20 });
  $('#perm-state-label').textContent = t(state.lang, granted ? 'options.permissions.granted' : 'options.permissions.notGranted');
  $('#perm-state-desc').textContent = t(state.lang, granted ? 'options.permissions.grantedDesc' : 'options.permissions.notGrantedDesc');
  $('#btn-grant').style.display = granted ? 'none' : '';
  $('#btn-revoke').style.display = granted ? '' : 'none';
}

async function renderHistory() {
  const jobs = await listJobs();
  const finished = jobs.filter((j) => !ACTIVE_STATUSES.includes(j.status)).length;
  $('#history-count-num').textContent = t(state.lang, 'options.history.count', { n: finished });
}

function renderLinks() {
  $('#link-repo').href = REPO_URL;
  $('#link-issues').href = ISSUES_URL;
  $('#link-privacy').href = PRIVACY_URL;
  $('#about-version').textContent = `v${VERSION}`;
}

/* ------------------------------------------------------------------- bind */

function bindControls() {
  document.querySelectorAll('.theme-card').forEach((card) => {
    card.addEventListener('click', async () => {
      state.settings.theme = card.dataset.themeChoice;
      applyTheme(state.settings.theme);
      renderThemeChoice();
      await setSetting('theme', state.settings.theme);
      toast(t(state.lang, 'options.saved'));
    });
  });

  document.querySelectorAll('.lang-card').forEach((card) => {
    card.addEventListener('click', async () => {
      state.lang = card.dataset.langChoice;
      state.settings.language = state.lang;
      setupPage(document, state.lang);
      renderLangChoice();
      renderQuality();
      await renderPermissions();
      await renderHistory();
      renderLinks();
      await setSetting('language', state.lang);
      toast(t(state.lang, 'options.saved'));
    });
  });

  $('#quality-range').addEventListener('input', (e) => {
    // live UI feedback only — persistence happens on 'change' to avoid
    // hammering chrome.storage.sync (120 writes/min quota) while dragging
    const val = Number(e.target.value);
    $('#quality-output').textContent = `${val}%`;
    const pct = ((val - 50) / 50) * 100;
    e.target.style.setProperty('--slider-fill', `${pct}%`);
  });
  $('#quality-range').addEventListener('change', async (e) => {
    const val = Number(e.target.value);
    state.settings.quality = val / 100;
    await setSetting('quality', state.settings.quality);
    toast(t(state.lang, 'options.saved'));
  });

  $('#notifications-toggle').addEventListener('change', async (e) => {
    state.settings.notifications = e.target.checked;
    await setSetting('notifications', state.settings.notifications);
    toast(t(state.lang, 'options.saved'));
  });

  $('#btn-grant').addEventListener('click', async () => {
    try {
      await chrome.permissions.request({ origins: ['*://*/*'] });
    } catch { /* dismissed */ }
    await renderPermissions();
  });

  $('#btn-revoke').addEventListener('click', async () => {
    try {
      await chrome.permissions.remove({ origins: ['*://*/*'] });
    } catch { /* ignore */ }
    await renderPermissions();
  });

  $('#btn-clear-history').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'DW_CLEAR_HISTORY' });
      await renderHistory();
      toast(t(state.lang, 'options.history.cleared'));
    } catch { /* ignore */ }
  });
}

/* ------------------------------------------------------------------- boot */

async function init() {
  state.settings = await getSettings();
  state.lang = state.settings.language;
  applyTheme(state.settings.theme);
  setupPage(document, state.lang);
  document.title = `${t(state.lang, 'options.title')} · DownWise`;

  // inject nav + inline icons
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, { size: 17 });
  });
  document.querySelectorAll('[data-icon-btn]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.iconBtn, { size: 15 }));
  });

  $('#notifications-toggle').checked = Boolean(state.settings.notifications);

  renderThemeChoice();
  renderLangChoice();
  renderQuality();
  renderLinks();
  await renderPermissions();
  await renderHistory();

  bindNav();
  bindControls();
}

init().catch((err) => {
  console.error('DownWise options init failed:', err);
});
