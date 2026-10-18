/**
 * Content sniffing via magic bytes + text heuristics.
 * Lets DownWise trust what a file *is* rather than what headers/URLs claim.
 * Recognizes classic formats AND modern ones (AVIF, HEIC/HEIF variants,
 * MP3 with or without ID3, WebM/Matroska) before a download dam is ever
 * opened. Pure module — also imported by Node tests.
 */

function latin1(bytes, offset, length) {
  let out = '';
  const end = Math.min(bytes.length, offset + length);
  for (let i = offset; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function matches(bytes, offset, sig) {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((v, i) => bytes[offset + i] === v);
}

function findAscii(bytes, needle, limit = 512) {
  const hay = latin1(bytes, 0, Math.min(bytes.length, limit));
  return hay.indexOf(needle);
}

/** ISO-BMFF brand at bytes 8..12 (after the 4-byte size + 'ftyp'). */
function ftypBrand(b) {
  return latin1(b, 8, 4).toLowerCase();
}

/**
 * MP3 frame-sync validation: 0xFF then sync bits, layer != invalid,
 * bitrate index != invalid (prevents false positives on random binary).
 */
function looksLikeMp3Frame(b) {
  if (b.length < 4) return false;
  if (b[0] !== 0xff || (b[1] & 0xe0) !== 0xe0) return false;
  const versionBits = (b[1] >> 3) & 0x03; // 1 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layerBits = (b[1] >> 1) & 0x03;   // 1 = Layer III (mp3), 2 = II, 3 = I
  if (versionBits === 1 || layerBits === 0) return false;
  return (b[2] & 0xf0) !== 0xf0;          // bitrate index 1111 is invalid
}

/**
 * @param {Uint8Array} bytes first chunk of the file (>= 16 bytes recommended)
 * @returns {{ext:string, mime:string, kind:string}|null}
 */
export function sniffType(bytes) {
  if (!bytes || bytes.length < 4) return null;
  const b = bytes;

  // --- Text-based formats first -------------------------------------------
  const head = latin1(b, 0, Math.min(b.length, 512)).toLowerCase();
  if (/^\s*(<!doctype\s+html|<html[\s>])/.test(head)) {
    return { ext: 'html', mime: 'text/html', kind: 'html' };
  }
  if (head.includes('#extm3u')) {
    return { ext: 'm3u8', mime: 'application/vnd.apple.mpegurl', kind: 'stream' };
  }
  // An HTML page that embeds an inline <svg> is still a page — only treat
  // near-pure SVG markup as an SVG image.
  if (head.includes('<svg') && !head.includes('<html') && !head.includes('</body>')) {
    return { ext: 'svg', mime: 'image/svg+xml', kind: 'image' };
  }

  // --- Binary signatures ---------------------------------------------------
  if (matches(b, 0, [0x89, 0x50, 0x4e, 0x47])) {
    return { ext: 'png', mime: 'image/png', kind: 'image' };
  }
  if (matches(b, 0, [0xff, 0xd8, 0xff])) {
    return { ext: 'jpg', mime: 'image/jpeg', kind: 'image' };
  }
  if (latin1(b, 0, 3) === 'GIF') {
    return { ext: 'gif', mime: 'image/gif', kind: 'image' };
  }
  if (latin1(b, 0, 4) === 'RIFF') {
    const four = latin1(b, 8, 4);
    if (four === 'WEBP') return { ext: 'webp', mime: 'image/webp', kind: 'image' };
    if (four === 'WAVE') return { ext: 'wav', mime: 'audio/wav', kind: 'audio' };
  }
  if (latin1(b, 4, 4) === 'ftyp') {
    const brand = ftypBrand(b);
    // Compatible brands live after major brand + minor version (offset 16+).
    const compat = latin1(b, 16, Math.min(b.length - 16, 48)).toLowerCase();
    const avifCompat = /avif|avis|ma1[a-b]/.test(compat);
    // AVIF: dedicated brands, or a HEIF container declaring AVIF compatibility.
    if (brand.startsWith('avi') || (avifCompat && /^(mif|msf|miaf|mai)/.test(brand))) {
      return { ext: 'avif', mime: 'image/avif', kind: 'image' };
    }
    // HEIC / HEIF: heic, heix, hevc, heim, heis, hevm, hevs + mif1 families.
    if (brand.startsWith('hei') || brand.startsWith('mif') || brand.startsWith('msf') || brand === 'miaf') {
      return { ext: 'heic', mime: 'image/heic', kind: 'image' };
    }
    if (brand === 'm4a ' || brand === 'm4b ' || brand === 'm4p ') {
      return { ext: 'm4a', mime: 'audio/mp4', kind: 'audio' };
    }
    return { ext: 'mp4', mime: 'video/mp4', kind: 'video' };
  }
  if (matches(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    // EBML = WebM or Matroska. The DocType string sits in the first bytes.
    const isWebm = findAscii(b, 'webm', 64) >= 0;
    return isWebm
      ? { ext: 'webm', mime: 'video/webm', kind: 'video' }
      : { ext: 'mkv', mime: 'video/x-matroska', kind: 'video' };
  }
  if (latin1(b, 0, 5) === '%PDF-') {
    return { ext: 'pdf', mime: 'application/pdf', kind: 'document' };
  }
  if (matches(b, 0, [0x50, 0x4b]) && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) {
    // ZIP container — try to identify OOXML / EPUB flavors
    if (findAscii(b, 'word/', 200) >= 0) {
      return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' };
    }
    if (findAscii(b, 'xl/', 200) >= 0) {
      return { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document' };
    }
    if (findAscii(b, 'ppt/', 200) >= 0) {
      return { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document' };
    }
    if (latin1(b, 30, 8) === 'mimetype' && findAscii(b.slice(30, 60), 'epub') >= 0) {
      return { ext: 'epub', mime: 'application/epub+zip', kind: 'document' };
    }
    return { ext: 'zip', mime: 'application/zip', kind: 'archive' };
  }
  // MP3: ID3v2 container OR a valid raw MPEG audio frame sync.
  if (latin1(b, 0, 3) === 'ID3' || looksLikeMp3Frame(b)) {
    return { ext: 'mp3', mime: 'audio/mpeg', kind: 'audio' };
  }
  if (latin1(b, 0, 4) === 'OggS') {
    return { ext: 'ogg', mime: 'audio/ogg', kind: 'audio' };
  }
  if (latin1(b, 0, 4) === 'fLaC') {
    return { ext: 'flac', mime: 'audio/flac', kind: 'audio' };
  }
  if (matches(b, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return { ext: '7z', mime: 'application/x-7z-compressed', kind: 'archive' };
  }
  if (latin1(b, 0, 4) === 'Rar!') {
    return { ext: 'rar', mime: 'application/vnd.rar', kind: 'archive' };
  }
  if (matches(b, 0, [0x1f, 0x8b])) {
    return { ext: 'gz', mime: 'application/gzip', kind: 'archive' };
  }
  if (b.length > 262 && latin1(b, 257, 5) === 'ustar') {
    return { ext: 'tar', mime: 'application/x-tar', kind: 'archive' };
  }
  if (matches(b, 0, [0x42, 0x4d]) && b.length > 16) {
    return { ext: 'bmp', mime: 'image/bmp', kind: 'image' };
  }
  if (matches(b, 0, [0x00, 0x00, 0x01, 0x00])) {
    return { ext: 'ico', mime: 'image/x-icon', kind: 'image' };
  }
  return null;
}
