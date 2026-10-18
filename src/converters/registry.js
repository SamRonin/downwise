/**
 * Registry of REAL output formats.
 * DownWise never fakes a conversion: every format listed here is something
 * Chromium can actually encode (canvas → PNG/JPEG/WebP), DownWise encodes
 * itself (PCM WAV) or records via the browser's own Opus encoder (WebM
 * audio through MediaRecorder). Video targets are stills: frame capture via
 * <video> + canvas. Formats without a real encoder (AVIF, SVG, MP3…) are
 * deliberately absent — honesty is a feature.
 */

export const OUTPUT_FORMATS = Object.freeze({
  png: Object.freeze({ id: 'png', ext: 'png', mime: 'image/png', kind: 'image', label: 'PNG' }),
  jpeg: Object.freeze({ id: 'jpeg', ext: 'jpg', mime: 'image/jpeg', kind: 'image', label: 'JPEG' }),
  webp: Object.freeze({ id: 'webp', ext: 'webp', mime: 'image/webp', kind: 'image', label: 'WebP' }),
  wav: Object.freeze({ id: 'wav', ext: 'wav', mime: 'audio/wav', kind: 'audio', label: 'WAV' }),
  webm: Object.freeze({ id: 'webm', ext: 'webm', mime: 'audio/webm', kind: 'audio', label: 'WebM (Opus)' }),
});

/** Convertible outputs for a detected file kind. */
export function availableOutputs(kind) {
  switch (kind) {
    case 'image':
      return ['png', 'jpeg', 'webp'];
    case 'video':
      // Stills only — frame capture, never a container remux.
      return ['png', 'jpeg', 'webp'];
    case 'audio':
      return ['wav', 'webm'];
    default:
      return [];
  }
}

/**
 * Outputs for a kind with the user's preferred format hoisted first.
 * Unknown/absent preferences keep the canonical order.
 */
export function orderedOutputs(kind, preferredId) {
  const outputs = availableOutputs(kind);
  if (!preferredId || !outputs.includes(preferredId)) return outputs;
  return [preferredId, ...outputs.filter((id) => id !== preferredId)];
}

/**
 * Outputs offered in the context menu for a given context-menu type.
 * `preferred` reorders the list (settings.defaultImageTarget).
 */
export function menuOutputsForContext(contextKind, preferred) {
  if (contextKind === 'image') return orderedOutputs('image', preferred);
  if (contextKind === 'video') return orderedOutputs('video', preferred);
  if (contextKind === 'audio') return availableOutputs('audio');
  return [];
}

/**
 * True when converting `fromKind` to `formatId` means capturing one video
 * frame instead of an image→image re-encode (used for menu labelling).
 */
export function isFrameCapture(fromKind, formatId) {
  return fromKind === 'video' && Boolean(OUTPUT_FORMATS[formatId]?.kind === 'image');
}
