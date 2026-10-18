/**
 * MIME / extension knowledge base for DownWise.
 * Pure module — no Chrome APIs (also imported by Node tests).
 */

export const MIME_BY_EXT = {
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',

  // Video
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
  '3gp': 'video/3gpp',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wma: 'audio/x-ms-wma',
  mid: 'audio/midi',
  midi: 'audio/midi',

  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  rtf: 'application/rtf',
  epub: 'application/epub+zip',

  // Archives
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  dmg: 'application/x-apple-diskimage',
  iso: 'application/x-iso9660-image',

  // Stream manifests (explicitly NOT downloadable as a media file)
  m3u8: 'application/vnd.apple.mpegurl',
  mpd: 'application/dash+xml',
};

export const EXT_BY_MIME = Object.entries(MIME_BY_EXT).reduce((acc, [ext, mime]) => {
  if (!acc[mime]) acc[mime] = ext;
  return acc;
}, {});

const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/rtf',
  'application/epub+zip',
  'text/plain',
  'text/markdown',
  'text/csv',
]);
const OFFICE_MIME_PREFIX = 'application/vnd.openxmlformats-officedocument';
const ARCHIVE_MIMES = new Set([
  'application/zip',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-bzip2',
  'application/x-xz',
  'application/x-apple-diskimage',
  'application/x-iso9660-image',
]);

/** Strip parameters ("; charset=utf-8") and lowercase. */
export function normalizeMime(mime) {
  if (!mime) return '';
  return String(mime).split(';')[0].trim().toLowerCase();
}

export function mimeFromExt(ext) {
  if (!ext) return '';
  return MIME_BY_EXT[String(ext).toLowerCase()] || '';
}

export function extFromMime(mime) {
  return EXT_BY_MIME[normalizeMime(mime)] || '';
}

/** Best-effort file extension from a URL (empty for data:/blob:/pages). */
export function extFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'data:' || u.protocol === 'blob:') return '';
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(decodeURIComponent(last));
    return m ? m[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

/** Logical file kind. 'html' and 'stream' are special-cased by the sniffer. */
export function kindFromMime(mime) {
  const m = normalizeMime(mime);
  if (!m) return 'other';
  if (m === 'text/html') return 'html';
  if (m === 'application/vnd.apple.mpegurl' || m === 'application/dash+xml') return 'stream';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (DOCUMENT_MIMES.has(m) || m.startsWith(OFFICE_MIME_PREFIX)) return 'document';
  if (ARCHIVE_MIMES.has(m)) return 'archive';
  return 'other';
}

export function kindFromExt(ext) {
  return kindFromMime(mimeFromExt(ext));
}

/** URLs that point at HLS/DASH manifests — media segments cannot be merged. */
export function isStreamManifestUrl(url) {
  try {
    const u = new URL(url);
    return /\.(m3u8|mpd)([?#]|$)/i.test(u.pathname) ||
      MIME_BY_EXT[(u.pathname.match(/\.([a-z0-9]+)$/i)?.[1] || '')] === 'application/vnd.apple.mpegurl';
  } catch {
    return false;
  }
}

/** Only http(s), data: and blob: URLs can be handled. */
export function supportedScheme(url) {
  try {
    const p = new URL(url).protocol;
    return p === 'https:' || p === 'http:' || p === 'data:' || p === 'blob:';
  } catch {
    return false;
  }
}
