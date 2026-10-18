/**
 * Filename helpers — sanitize, derive from URLs, swap extensions.
 * Pure module — also imported by Node tests.
 */

const ILLEGAL_CHARS = /[\\/:*?"<>|\u0000-\u001F]/g;

/** Make a string safe for chrome.downloads filename suggestions. */
export function sanitizeFilename(name, { maxLen = 180 } = {}) {
  let n = String(name ?? '')
    .normalize('NFC')
    .replace(ILLEGAL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, maxLen)
    .trim();
  if (!n || n === '.') n = 'file';
  return n;
}

/** Derive a base filename from a URL (query string removed). */
export function baseNameFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'data:') return 'file';
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    let name = last ? decodeURIComponent(last) : '';
    name = name.split('?')[0].split('#')[0];
    if (!name) {
      name = `file-${u.hostname.replace(/^www\./, '')}`;
    }
    return sanitizeFilename(name, { maxLen: 120 });
  } catch {
    return 'file';
  }
}

function hasExtension(name) {
  return /\.[A-Za-z0-9]{1,8}$/.test(name);
}

export function stripExtension(name) {
  return name.replace(/\.[A-Za-z0-9]{1,8}$/, '');
}

/** Replace (or append) a file extension, lower-casing it. */
export function replaceExtension(name, ext) {
  const clean = String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return name;
  const base = hasExtension(name) ? stripExtension(name) : name;
  return `${base || 'file'}.${clean}`;
}

/** Add extension only when the name has none. */
export function ensureExtension(name, ext) {
  if (hasExtension(name)) return name;
  return `${name}.${String(ext || '').toLowerCase()}`;
}
