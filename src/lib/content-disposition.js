/**
 * RFC 6266 / RFC 5987 `Content-Disposition` filename extraction.
 * Servers often reveal the REAL filename (with clean extension) here —
 * far more trustworthy than the URL tail. Pure module — also imported
 * by Node tests.
 */

/** RFC 2047 encoded-word: =?charset?B|Q?...?= */
const RFC2047 = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/;

function decodePercent(value, charset = 'utf-8') {
  const bytes = [];
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '%' && i + 2 < value.length + 1 && /^[0-9a-fA-F]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = value.codePointAt(i);
      if (code < 0x80) bytes.push(code);
      else bytes.push(...String.fromCodePoint(code).split('').map((c) => c.charCodeAt(0) & 0xff));
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
}

function decodeQuotedPrintable(value) {
  return value
    .replace(/_/g, ' ')
    .replace(/=([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeRfc2047(value) {
  return value.replace(RFC2047, (_, charset, enc, text) => {
    try {
      if (enc.toLowerCase() === 'b') {
        const bin = atob(text);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new TextDecoder(charset).decode(bytes);
      }
      return decodeQuotedPrintable(text);
    } catch {
      return text;
    }
  });
}

/** Strip directory components (both URI and Windows separators). */
function stripPath(name) {
  return String(name || '').split(/[/\\]/).pop() || '';
}

/** Remove control characters, trim quotes/space, drop trailing dots. */
function tidyName(name) {
  let n = String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
  n = n.replace(/\.+$/, '').trimEnd(); // no "file.png." / "file.png   "
  return n;
}

/**
 * Extract the best filename from a Content-Disposition header value.
 * Preference order per RFC 6266 §4.3: `filename*` (ext-value, RFC 5987)
 * wins over `filename`; RFC 2047 encoded-words are honoured as a legacy
 * courtesy; unknown `filename*N=` continuations fall back to plain parts.
 *
 * @param {string|null|undefined} header raw header value
 * @returns {string|null} cleaned filename (name + extension), or null
 */
export function filenameFromContentDisposition(header) {
  if (!header || typeof header !== 'string') return null;

  // 1) RFC 5987 ext-value: filename*=UTF-8''%D8%AA.png (note the asterisk!)
  const extValue = /filename\s*\*\s*=\s*([!#$%&'*+.^_`|~0-9A-Za-z-]*)''([^;]*)/i.exec(header);
  if (extValue) {
    const name = tidyName(decodePercent(extValue[2].trim(), extValue[1] || 'utf-8'));
    if (name) return stripPath(name);
  }

  // 2) Legacy RFC 2047 encoded-word: filename="?UTF-8?B?...?="
  const encoded = /filename\s*=\s*"?([^";]*(?:=\?[^?]*\?[^?]*\?[^?]*\?)[^";]*)"?(;|$)/i.exec(header);
  if (encoded) {
    const name = tidyName(decodeRfc2047(encoded[1].trim()));
    if (name && !RFC2047.test(name)) return stripPath(name);
  }

  // 3) Quoted-string or plain token: filename="my file.png"
  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header)
    || /filename\s*=\s*([^;]+)/i.exec(header);
  if (quoted) {
    const raw = quoted[1].replace(/\\(.)/g, '$1').trim();
    if (/^utf-8/i.test(raw)) {
      // Some servers emit filename=utf-8''… — still percent-encoded.
      const inner = /^utf-8''(.*)$/i.exec(raw);
      if (inner) {
        const name = tidyName(decodePercent(inner[1], 'utf-8'));
        if (name) return stripPath(name);
      }
    }
    const name = tidyName(raw);
    if (name) return stripPath(name);
  }

  return null;
}

/** Lower-cased extension from a filename ('' for dotfiles / none / too long). */
export function extFromFilename(name) {
  // A real extension needs a non-dot character before the dot — '.hidden'
  // is a dotfile, not a file with the extension "hidden".
  const m = /([^.])\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
  return m ? m[2].toLowerCase() : '';
}
