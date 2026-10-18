/**
 * DownWise service worker (MV3, ES module).
 * Wires: context menus → pipeline → downloads; settings → menu language;
 * extension-page messages → state & actions.
 */
import { buildContextMenus, registerMenuHandlers } from './menu.js';
import { handleMenuClick, retryJob, registerDownloadWatchers, registerNotificationClicks, updateBadge } from './pipeline.js';
import { getSettings, onSettingsChanged } from '../lib/settings.js';
import { listJobs, removeJob, clearFinishedJobs, broadcastJobs } from '../lib/jobs.js';
import { ACTIVE_STATUSES } from '../lib/jobs.js';

/* ------------------------------------------------------------- bootstrap */

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await buildContextMenus(settings.language);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await buildContextMenus(settings.language);
});

onSettingsChanged((changes) => {
  if (changes.language && typeof changes.language.newValue === 'string') {
    buildContextMenus(changes.language.newValue).catch(() => {});
  }
});

registerMenuHandlers(handleMenuClick);
registerDownloadWatchers();
registerNotificationClicks();

/**
 * Minimal debug handle on the worker global — usable from
 * chrome://serviceworker-internals and by automated integration tests.
 * (Service-worker globals are isolated from web pages; nothing is exposed.)
 */
self.DownWise = { handleMenuClick, retryJob, version: chrome.runtime.getManifest().version };

/* --------------------------------------------------------- message router */

async function hasAllHostAccess() {
  try {
    return await chrome.permissions.contains({ origins: ['*://*/*'] });
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const type = msg?.type;

  if (type === 'DW_PING') {
    sendResponse({ ok: true, pong: true });
    return false;
  }

  if (type === 'DW_GET_STATE') {
    (async () => {
      const [jobs, settings, hostAccess] = await Promise.all([
        listJobs(),
        getSettings(),
        hasAllHostAccess(),
      ]);
      sendResponse({ ok: true, jobs, settings, hostAccess });
    })().catch((err) => sendResponse({ ok: false, message: err?.message }));
    return true; // async
  }

  if (type === 'DW_RETRY') {
    retryJob(msg.jobId).then((ok) => sendResponse({ ok })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (type === 'DW_REMOVE_JOB') {
    (async () => {
      const jobs = await listJobs();
      const target = jobs.find((j) => j.id === msg.jobId);
      if (target && !ACTIVE_STATUSES.includes(target.status)) {
        await removeJob(msg.jobId);
      }
      await broadcastJobs();
      sendResponse({ ok: true });
    })().catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (type === 'DW_CLEAR_HISTORY') {
    clearFinishedJobs()
      .then(async (count) => {
        await broadcastJobs();
        await updateBadge();
        sendResponse({ ok: true, count });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // DW_OFFSCREEN_* messages belong to the offscreen document — ignored here.
  return false;
});
