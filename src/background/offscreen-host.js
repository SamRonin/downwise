/**
 * Service-worker side of the offscreen document (MV3 chrome.offscreen API).
 * Lazily creates the document when SVG rasterization or audio decoding is
 * needed, then exchanges base64 payloads with it.
 */
import { DownWiseError } from '../lib/errors.js';
import { bytesToBase64 } from '../lib/base64.js';

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
let creating = null;

function offscreenApi() {
  if (typeof chrome === 'undefined' || !chrome?.offscreen || !chrome?.runtime?.getContexts) {
    throw new DownWiseError('OFFSCREEN_FAILED', { message: 'chrome.offscreen unavailable' });
  }
  return chrome.offscreen;
}

export async function ensureOffscreen() {
  const api = offscreenApi();
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts && contexts.length > 0) return;
  if (!creating) {
    creating = api.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['DOM_PARSER', 'AUDIO_PLAYBACK'],
      justification: 'Rasterize SVG images and decode audio for real format conversion.',
    }).finally(() => { creating = null; });
  }
  await creating;
}

/** Round-trip a request to the offscreen document with a timeout. */
export function callOffscreen(payload, { timeoutMs = 180000 } = {}) {
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
}

export async function withOffscreen(payload) {
  await ensureOffscreen();
  return callOffscreen(payload);
}

/**
 * Create a downloadable blob URL for converted bytes.
 * Primary: offscreen document (works for large payloads).
 * Fallback: inline data: URL (works everywhere, heavier for big files).
 * @returns {{ url: string, kind: 'blob' | 'data' }}
 */
export async function makeBlobUrl(bytes, mime) {
  try {
    const res = await withOffscreen({
      type: 'DW_OFFSCREEN_MAKE_BLOB_URL',
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
}

/** Free the blob URL created in the offscreen document (data: needs nothing). */
export async function revokeBlobUrl(entry) {
  if (!entry || entry.kind !== 'blob') return;
  try {
    await chrome.runtime.sendMessage({ type: 'DW_OFFSCREEN_REVOKE_BLOB_URL', url: entry.url });
  } catch { /* offscreen already gone */ }
}
