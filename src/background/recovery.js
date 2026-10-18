/**
 * Smart page-resource recovery.
 * When a URL answers with an HTML page (hotlink protection, login walls,
 * CDN rewrites), we look inside the page that the user actually clicked in
 * and try better candidate URLs (data-* full-size attributes, srcset,
 * og:image, sibling <source> variants, matching <a href>).
 *
 * The *_IN_PAGE functions must be fully self-contained — Chrome serializes
 * their source and runs them inside the page.
 */
import { DownWiseError } from '../lib/errors.js';

function pageFindCandidates_IN_PAGE(kind, url) {
  const abs = (u) => {
    try {
      return u ? new URL(u, location.href).href : null;
    } catch {
      return null;
    }
  };
  const base = (u) => {
    try {
      return decodeURIComponent(new URL(u).pathname.split('/').pop() || '').toLowerCase();
    } catch {
      return '';
    }
  };

  const target = abs(url);
  const baseName = base(target);
  const results = [];
  const push = (u) => {
    const a = abs(u);
    if (a && a !== target && !results.includes(a)) results.push(a);
  };

  const DATA_ATTRS = [
    'data-original', 'data-src', 'data-large-file', 'data-zoom-image', 'data-zoom',
    'data-hi-res-src', 'data-image', 'data-full', 'data-full-url', 'data-big',
    'data-lazy-src', 'data-echo', 'data-srcset', 'data-fallback-src',
  ];

  const matchesTarget = (candidate) =>
    candidate && (candidate === target || (baseName && base(candidate) === baseName));

  if (kind === 'image') {
    document.querySelectorAll('img').forEach((img) => {
      const src = abs(img.currentSrc || img.getAttribute('src'));
      if (!matchesTarget(src)) return;
      // Best-quality candidates first
      for (const attr of DATA_ATTRS) push(img.getAttribute(attr));
      const srcset = img.getAttribute('srcset') || '';
      const parts = srcset.split(',').map((p) => p.trim().split(/\s+/)).filter(Boolean);
      const widest = parts.sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0))[0];
      if (widest) push(widest[0]);
      const picture = img.closest('picture');
      picture?.querySelectorAll('source').forEach((s) => {
        const sset = (s.getAttribute('srcset') || '').split(',').map((p) => p.trim().split(/\s+/)[0]);
        if (sset.length) push(sset[sset.length - 1]);
      });
    });
    // Page-level fallbacks
    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]')
      .forEach((el) => push(el.getAttribute('content') || el.getAttribute('href')));
  }

  if (kind === 'video' || kind === 'audio') {
    document.querySelectorAll(`${kind}, ${kind} source`).forEach((el) => {
      const src = abs(el.currentSrc || el.getAttribute('src'));
      if (!matchesTarget(src)) return;
      const media = el.closest(kind) || el;
      media.querySelectorAll('source').forEach((s) => push(s.getAttribute('src')));
      push(media.getAttribute('src'));
      push(media.getAttribute('data-src'));
    });
  }

  // Anchors that point at the same file name (often the direct-download link)
  if (baseName) {
    document.querySelectorAll('a[href]').forEach((a) => {
      if (base(a.href) === baseName) push(a.href);
    });
  }

  return results.slice(0, 6);
}

function pageFetch_IN_PAGE(url, maxBytes) {
  return (async () => {
    try {
      const res = await fetch(url, { credentials: 'include', redirect: 'follow' });
      if (!res.ok) return { error: 'HTTP', status: res.status };
      const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const buf = await res.arrayBuffer();
      if (buf.byteLength > maxBytes) return { error: 'FILE_TOO_LARGE' };
      const bytes = new Uint8Array(buf);
      let bin = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      return { base64: btoa(bin), mime, finalUrl: res.url || url, size: bytes.length };
    } catch (err) {
      return { error: 'CORS', message: String(err) };
    }
  })();
}

function scriptTarget(tabId, frameId) {
  if (frameId != null && frameId > 0) return { tabId, frameIds: [frameId] };
  return { tabId };
}

/**
 * Ask the page for better candidate URLs. Returns [] when scripting is
 * unavailable (no activeTab, chrome:// pages, discarded tabs…).
 */
export async function findPageCandidates(tabId, frameId, kind, url) {
  if (typeof chrome === 'undefined' || !chrome?.scripting?.executeScript || tabId == null) return [];
  try {
    const [res] = await chrome.scripting.executeScript({
      target: scriptTarget(tabId, frameId),
      func: pageFindCandidates_IN_PAGE,
      args: [kind, url],
    });
    return Array.isArray(res?.result) ? res.result : [];
  } catch {
    return [];
  }
}

/**
 * Fetch bytes from *inside* the page (same-origin cookies, blob: URLs).
 * @returns {{ base64: string, mime: string, finalUrl: string, size: number }}
 */
export async function pageFetch(tabId, frameId, url, maxBytes = 25 * 1024 * 1024) {
  if (typeof chrome === 'undefined' || !chrome?.scripting?.executeScript || tabId == null) {
    throw new DownWiseError('PERMISSION_REQUIRED', { url });
  }
  const [res] = await chrome.scripting.executeScript({
    target: scriptTarget(tabId, frameId),
    func: pageFetch_IN_PAGE,
    args: [url, maxBytes],
  }).catch(() => [null]);

  const result = res?.result;
  if (!result) throw new DownWiseError('CORS', { url });
  if (result.error) {
    throw new DownWiseError(result.error, { status: result.status ?? null, url });
  }
  return result;
}
