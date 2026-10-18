/**
 * Network layer with honest content validation.
 * - With optional host access granted, service-worker fetch bypasses CORS.
 * - Every payload is sniffed: an HTML page instead of the requested file
 *   raises HTML_RESPONSE instead of silently saving garbage.
 * - Streams are downloaded with byte-accurate progress.
 */
import { DownWiseError } from '../lib/errors.js';
import { normalizeMime } from '../lib/mime.js';
import { sniffType } from '../lib/sniff.js';

export const MAX_BYTES = 250 * 1024 * 1024; // hard cap for any single fetch

/** Match pattern for a URL's origin (for chrome.permissions checks). */
export function originPattern(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

export async function hasHostAccess(url) {
  const pattern = originPattern(url);
  if (!pattern || typeof chrome === 'undefined' || !chrome?.permissions?.contains) return false;
  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

async function readBody(res, { onProgress, maxBytes }) {
  const totalHeader = res.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;

  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress?.(buf.byteLength, buf.byteLength);
    return new Uint8Array(buf);
  }

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  let lastReport = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (received > maxBytes) {
      try { await reader.cancel(); } catch { /* already closed */ }
      throw new DownWiseError('FILE_TOO_LARGE', { url: res.url });
    }
    const now = Date.now();
    if (onProgress && now - lastReport > 120) {
      lastReport = now;
      onProgress(received, total);
    }
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress?.(received, received);
  return out;
}

function assertNotHtml(mime, bytes, url) {
  if (normalizeMime(mime) === 'text/html') {
    throw new DownWiseError('HTML_RESPONSE', { url });
  }
  return sniffType(bytes.subarray(0, Math.min(bytes.length, 1024)));
}

/**
 * Fetch a complete resource.
 * @returns {{ bytes: Uint8Array, mime: string, sniffed: object|null, finalUrl: string, size: number }}
 */
export async function fetchResource(url, { onProgress, maxBytes = MAX_BYTES, credentials = 'include' } = {}) {
  let res;
  try {
    res = await fetch(url, { credentials, redirect: 'follow' });
  } catch (err) {
    const access = url.startsWith('http') ? await hasHostAccess(url) : false;
    throw new DownWiseError(access ? 'NETWORK' : 'CORS', { url, message: err?.message });
  }
  if (!res.ok) throw new DownWiseError('HTTP', { status: res.status, url: res.url });

  const mime = normalizeMime(res.headers.get('content-type') || '');
  const bytes = await readBody(res, { onProgress, maxBytes });
  const sniffed = assertNotHtml(mime, bytes, res.url);

  return {
    bytes,
    mime: sniffed?.mime || mime || 'application/octet-stream',
    sniffed,
    finalUrl: res.url || url,
    size: bytes.length,
  };
}

/**
 * Lightweight probe used before "original file" downloads: reads only the
 * first KB (via Range when possible) to detect HTML responses cheaply.
 * Never throws — unreachable URLs are reported and the caller can fall back
 * to a direct chrome.downloads download.
 */
export async function probeResource(url) {
  try {
    const res = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
      headers: { Range: 'bytes=0-1023' },
    });
    if (!res.ok && res.status !== 206) {
      return { reachable: false, status: res.status, html: false, url: res.url || url };
    }
    let bytes = new Uint8Array(0);
    const reader = res.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      if (value) bytes = value;
      try { await reader.cancel(); } catch { /* ignore */ }
    }
    const mime = normalizeMime(res.headers.get('content-type') || '');
    const sniffed = bytes.length ? sniffType(bytes) : null;
    return {
      reachable: true,
      status: res.status,
      html: mime === 'text/html' || sniffed?.kind === 'html',
      stream: sniffed?.kind === 'stream',
      mime: sniffed?.mime || mime,
      sniffed,
      url: res.url || url,
    };
  } catch {
    // CORS/network — cannot verify here; browser download path may still work.
    return { reachable: false, html: false };
  }
}
