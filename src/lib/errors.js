/**
 * Typed errors with i18n-mappable codes.
 * The UI maps `errors.<code>` translation keys to localized messages —
 * no raw English strings ever leak into Persian UI.
 */

export const ErrorCodes = {
  NETWORK: 'NETWORK',                 // network-level failure (DNS, reset, …)
  HTTP: 'HTTP',                       // non-2xx response (status attached)
  CORS: 'CORS',                       // blocked by CORS without host permission
  HTML_RESPONSE: 'HTML_RESPONSE',     // got a web page instead of the file
  RECOVERY_FAILED: 'RECOVERY_FAILED', // smart page-resource lookup found nothing usable
  UNSUPPORTED_STREAM: 'UNSUPPORTED_STREAM', // HLS/DASH or MSE blob
  UNSUPPORTED_SCHEME: 'UNSUPPORTED_SCHEME', // file:, chrome:, ftp:, …
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  TOO_LARGE_FOR_CONVERSION: 'TOO_LARGE_FOR_CONVERSION',
  CONVERSION_FAILED: 'CONVERSION_FAILED',
  DECODE_FAILED: 'DECODE_FAILED',     // audio decode failure
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED', // chrome.downloads interruption
  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
  KIND_MISMATCH: 'KIND_MISMATCH',     // e.g. asked to convert a video to PNG
  OFFSCREEN_FAILED: 'OFFSCREEN_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  UNKNOWN: 'UNKNOWN',
};

export class DownWiseError extends Error {
  constructor(code, { message, status, url } = {}) {
    super(message || code);
    this.name = 'DownWiseError';
    this.code = ErrorCodes[code] || ErrorCodes.UNKNOWN;
    this.status = status ?? null;
    this.url = url ?? null;
  }
}

/** Normalize any thrown value into a DownWiseError. */
export function toDownWiseError(err) {
  if (err instanceof DownWiseError) return err;
  if (err instanceof TypeError) {
    // Chromium throws TypeError("Failed to fetch") for both network and CORS.
    return new DownWiseError('CORS', { message: err?.message });
  }
  return new DownWiseError('UNKNOWN', { message: err?.message || String(err) });
}

/** i18n key for a code (dictionaries must contain `errors.<code>`). */
export function i18nKeyForCode(code) {
  return `errors.${ErrorCodes[code] || ErrorCodes.UNKNOWN}`;
}
