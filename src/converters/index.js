/**
 * Conversion orchestrator used by the background pipeline.
 * Chooses the fastest honest path:
 *   raster images  → OffscreenCanvas right inside the service worker
 *   SVG images     → offscreen document (DOM required)
 *   audio          → offscreen document (Web Audio + MediaRecorder)
 *   video frames   → offscreen document (<video> + canvas)
 *
 * ALL heavy work goes through a small concurrency queue (task-queue.js):
 * several simultaneous menu clicks must not stack decode buffers, bitmaps
 * and canvases on top of each other and blow up renderer memory.
 */
import { OUTPUT_FORMATS } from './registry.js';
import { convertRasterImage, convertSvgImage } from './image.js';
import { withOffscreen } from '../background/offscreen-host.js';
import { conversionQueue } from '../lib/task-queue.js';
import { arrayBufferToBase64, base64ToBytes } from '../lib/base64.js';
import { DownWiseError } from '../lib/errors.js';
import { MSG } from '../lib/messages.js';
import { DEFAULT_AUDIO_BITRATE } from './audio.js';

/** Per-kind byte caps for conversions (originals are capped at 250 MB). */
export const CONVERSION_SIZE_LIMITS = Object.freeze({
  image: 30 * 1024 * 1024,  // 30 MB
  audio: 45 * 1024 * 1024,  // 45 MB (base64 runtime-message transport stays < 64 MB)
  video: 45 * 1024 * 1024,  // 45 MB — frame capture downloads the whole file
});

/**
 * @param {Uint8Array} bytes
 * @param {{mime?:string, kind?:string, isSvg?:boolean}} source
 * @param {string} targetId 'png' | 'jpeg' | 'webp' | 'wav' | 'webm'
 * @param {{quality?:number, bitrateKbps?:number, atSeconds?:number}} options
 */
export function convertFile(bytes, source, targetId, options = {}) {
  // Serialize heavy work — the queue returns the same result as running
  // directly when idle, and throttles when several jobs race.
  return conversionQueue.run(() => dispatchConversion(bytes, source, targetId, options));
}

async function dispatchConversion(bytes, source, targetId, options) {
  const fmt = OUTPUT_FORMATS[targetId];
  if (!fmt) throw new DownWiseError('INVALID_INPUT', { message: `unknown target ${targetId}` });
  const quality = options.quality ?? 0.92;

  if (fmt.kind === 'image') {
    // Frame capture: videos → one still frame (offscreen document).
    if (source.kind === 'video') return captureFrame(bytes, source, targetId, options);
    if (source.kind !== 'image') throw new DownWiseError('KIND_MISMATCH');
    return convertImage(bytes, source, targetId, quality);
  }

  // fmt.kind === 'audio'
  if (source.kind !== 'audio') throw new DownWiseError('KIND_MISMATCH');
  return convertAudio(bytes, targetId, options.bitrateKbps || DEFAULT_AUDIO_BITRATE);
}

async function convertImage(bytes, source, targetId, quality) {
  const blob = new Blob([bytes], { type: source.mime || 'application/octet-stream' });

  if (source.isSvg) {
    const r = await convertSvgImage(blob, targetId, { quality });
    return finish(r.blob, targetId, { width: r.width, height: r.height });
  }

  try {
    const r = await convertRasterImage(blob, targetId, { quality });
    return finish(r.blob, targetId, { width: r.width, height: r.height });
  } catch (err) {
    if (err instanceof DownWiseError) throw err;
    // Exotic raster the worker can't decode (e.g. some ICO/HEIC variants) —
    // retry inside the offscreen document which has the full DOM codec stack.
    return convertImageViaOffscreen(bytes, source, targetId, quality);
  }
}

async function convertImageViaOffscreen(bytes, source, targetId, quality) {
  const res = await withOffscreen({
    type: MSG.OFFSCREEN_CONVERT_IMAGE,
    base64: arrayBufferToBase64(bytes),
    mime: source.mime || '',
    target: targetId,
    quality,
  });
  return {
    bytes: base64ToBytes(res.base64),
    mime: res.mime,
    info: { width: res.width || null, height: res.height || null },
  };
}

/** Video → PNG/JPEG/WebP still (poster frame) via the offscreen document. */
async function captureFrame(bytes, source, targetId, { quality, atSeconds }) {
  const res = await withOffscreen({
    type: MSG.OFFSCREEN_CONVERT_VIDEO_FRAME,
    base64: arrayBufferToBase64(bytes),
    mime: source.mime || '',
    target: targetId,
    quality,
    atSeconds: Number.isFinite(Number(atSeconds)) ? Number(atSeconds) : 0,
  });
  return {
    bytes: base64ToBytes(res.base64),
    mime: res.mime,
    info: { width: res.width || null, height: res.height || null, frameFrom: 'video' },
  };
}

async function convertAudio(bytes, targetId, bitrateKbps) {
  const res = await withOffscreen({
    type: MSG.OFFSCREEN_CONVERT_AUDIO,
    base64: arrayBufferToBase64(bytes),
    target: targetId,
    bitrateKbps,
  });
  return {
    bytes: base64ToBytes(res.base64),
    mime: res.mime,
    info: {
      durationSec: res.durationSec || null,
      sampleRate: res.sampleRate || null,
      channels: res.channels || null,
      bitrateKbps: res.mime === 'audio/webm' ? bitrateKbps : null,
    },
  };
}

async function finish(blob, targetId, dims) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, mime: OUTPUT_FORMATS[targetId].mime, info: dims };
}
