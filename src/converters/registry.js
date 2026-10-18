/**
 * Registry of REAL output formats.
 * DownWise never fakes a conversion: every format listed here is something
 * Chromium can actually encode (canvas → PNG/JPEG/WebP) or DownWise encodes
 * itself (PCM WAV). Formats without a real encoder (AVIF, SVG, MP3…) are
 * deliberately absent — honesty is a feature.
 */

export const OUTPUT_FORMATS = Object.freeze({
  png: Object.freeze({ id: 'png', ext: 'png', mime: 'image/png', kind: 'image', label: 'PNG' }),
  jpeg: Object.freeze({ id: 'jpeg', ext: 'jpg', mime: 'image/jpeg', kind: 'image', label: 'JPEG' }),
  webp: Object.freeze({ id: 'webp', ext: 'webp', mime: 'image/webp', kind: 'image', label: 'WebP' }),
  wav: Object.freeze({ id: 'wav', ext: 'wav', mime: 'audio/wav', kind: 'audio', label: 'WAV' }),
});

/** Convertible outputs for a detected file kind. */
export function availableOutputs(kind) {
  switch (kind) {
    case 'image':
      return ['png', 'jpeg', 'webp'];
    case 'audio':
      return ['wav'];
    default:
      return [];
  }
}

/** Outputs offered in the context menu for a given context-menu type. */
export function menuOutputsForContext(contextKind) {
  if (contextKind === 'image') return availableOutputs('image');
  if (contextKind === 'audio') return availableOutputs('audio');
  return [];
}
