/**
 * Permission grant page — opened from Options (or docs links) when the user
 * prefers an explanation before Chrome's permission prompt.
 */
import { getSettings } from '../lib/settings.js';
import { setupPage, t } from '../i18n/index.js';
import { icon } from './icons.js';
import { applyTheme } from './theme.js';

const $ = (sel) => document.querySelector(sel);

async function init() {
  const settings = await getSettings();
  applyTheme(settings.theme);
  setupPage(document, settings.language);

  $('#grant-icon').innerHTML = icon('shieldCheck', { size: 30, strokeWidth: 1.6 });
  $('#btn-allow').innerHTML = `${icon('zap', { size: 16 })}<span>${t(settings.language, 'grant.allow')}</span>`;
  $('#grant-success-icon').innerHTML = icon('check', { size: 15 });

  $('#btn-allow').addEventListener('click', async () => {
    try {
      const granted = await chrome.permissions.request({ origins: ['*://*/*'] });
      if (granted) {
        $('#btn-allow').hidden = true;
        $('#grant-success').hidden = false;
        setTimeout(() => window.close(), 1400);
      }
    } catch { /* user dismissed */ }
  });
}

init().catch((err) => console.error('DownWise grant init failed:', err));
