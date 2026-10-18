/**
 * Central message catalogue — single source of truth for every runtime
 * message type. All `chrome.runtime.onMessage` routers switch on these
 * frozen constants instead of scattering raw string literals.
 * Pure module — no Chrome APIs (also imported by Node tests).
 */

/** Prefix reserved for messages handled by the offscreen document. */
export const OFFSCREEN_PREFIX = 'DW_OFFSCREEN_';

export const MSG = Object.freeze({
  // Worker ↔ extension pages
  PING: 'DW_PING',
  GET_STATE: 'DW_GET_STATE',
  RETRY: 'DW_RETRY',
  REMOVE_JOB: 'DW_REMOVE_JOB',
  CLEAR_HISTORY: 'DW_CLEAR_HISTORY',
  JOBS_UPDATED: 'DW_JOBS_UPDATED',

  // Service worker → offscreen document
  OFFSCREEN_PING: `${OFFSCREEN_PREFIX}PING`,
  OFFSCREEN_CONVERT_IMAGE: `${OFFSCREEN_PREFIX}CONVERT_IMAGE`,
  OFFSCREEN_CONVERT_AUDIO: `${OFFSCREEN_PREFIX}CONVERT_AUDIO`,
  OFFSCREEN_CONVERT_VIDEO_FRAME: `${OFFSCREEN_PREFIX}CONVERT_VIDEO_FRAME`,
  OFFSCREEN_MAKE_BLOB_URL: `${OFFSCREEN_PREFIX}MAKE_BLOB_URL`,
  OFFSCREEN_REVOKE_BLOB_URL: `${OFFSCREEN_PREFIX}REVOKE_BLOB_URL`,
});

/** True when a message type belongs to the offscreen document. */
export function isOffscreenMessage(type) {
  return typeof type === 'string' && type.startsWith(OFFSCREEN_PREFIX);
}

/**
 * Build a uniform onMessage router: a frozen map type → async handler.
 * Handlers return the response payload; the router wraps results as
 * `{ ok: true, ...payload }` and failures as `{ ok: false, code, message }`.
 * Unhandled types fall through (listener returns false).
 */
export function createRouter(handlers, { onError } = {}) {
  const table = Object.freeze({ ...handlers });
  return (msg, sender, sendResponse) => {
    const handler = msg && typeof msg.type === 'string' ? table[msg.type] : null;
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(msg, sender))
      .then((payload) => sendResponse(payload === undefined ? { ok: true } : { ok: true, ...payload }))
      .catch((err) => {
        if (onError) onError(err, msg);
        sendResponse({
          ok: false,
          code: err?.code || 'UNKNOWN',
          message: err?.message || String(err),
        });
      });
    return true; // keep the message channel open for the async reply
  };
}
