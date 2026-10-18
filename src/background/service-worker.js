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
import { MSG, createRouter } from '../lib/messages.js';
import { closeOffscreenIfIdle, teardownOffscreen } from './offscreen-host.js';

/* ------------------------------------------------------------- bootstrap */

async function rebuildMenusFromSettings() {
  const settings = await getSettings();
  await buildContextMenus(settings);
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildMenusFromSettings().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  rebuildMenusFromSettings().catch(() => {});
});

// Rebuild the menus when language, context-menu toggle or the preferred
// conversion format changes. Nothing else can affect the menu tree.
onSettingsChanged((changes) => {
  const relevant = ['language', 'contextMenus', 'defaultImageTarget'];
  if (relevant.some((key) => changes[key])) {
    rebuildMenusFromSettings().catch(() => {});
  }
});

registerMenuHandlers(handleMenuClick);
registerDownloadWatchers();
registerNotificationClicks();

// Best-effort cleanup when the worker is being shut down: the idle closer
// refuses to close while downloads still read offscreen blob URLs.
if (chrome.runtime?.onSuspend?.addListener) {
  chrome.runtime.onSuspend.addListener(() => {
    closeOffscreenIfIdle().catch(() => {});
    teardownOffscreen().catch(() => {});
  });
}

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

const WORKER_HANDLERS = Object.freeze({
  // Synchronous-shaped handlers return their payload; the router wraps it.
  [MSG.PING]: () => ({ pong: true }),

  [MSG.GET_STATE]: async () => {
    const [jobs, settings, hostAccess] = await Promise.all([
      listJobs(),
      getSettings(),
      hasAllHostAccess(),
    ]);
    return { jobs, settings, hostAccess };
  },

  [MSG.RETRY]: async (msg) => ({ ok: Boolean(await retryJob(msg.jobId)) }),

  [MSG.REMOVE_JOB]: async (msg) => {
    const jobs = await listJobs();
    const target = jobs.find((j) => j.id === msg.jobId);
    if (target && !ACTIVE_STATUSES.includes(target.status)) {
      await removeJob(msg.jobId);
    }
    await broadcastJobs();
    return {};
  },

  [MSG.CLEAR_HISTORY]: async () => {
    const count = await clearFinishedJobs();
    await broadcastJobs();
    await updateBadge();
    return { count };
  },
});

chrome.runtime.onMessage.addListener(createRouter(WORKER_HANDLERS));
