/**
 * Conversion orchestrator used by the background pipeline.
 * Chooses the fastest honest path:
 *   raster images → OffscreenCanvas right inside the service worker
 *   SVG images / audio → offscreen document (DOM / Web Audio required)
 */
import { OUTPUT_FORMATS } from './registry.js';
import { convertRasterImage, convertSvgImage } from './image.js';
import { withOffscreen } from '../background/offscreen-host.js';
import { arrayBufferToBase64, base64ToBytes } from '../lib/base64.js';
import { DownWiseError } from '../lib/errors.js';

/** Per-kind byte caps for conversions (originals are capped at 250 MB). */
export const CONVERSION_SIZE_LIMITS = Object.freeze({
  image: 30 * 1024 * 1024,  // 30 MB
  audio: 45 * 1024 * 1024,  // 45 MB (base64 runtime-message transport stays < 64 MB)
});

/**
 * @param {Uint8Array} bytes
 * @param {{mime?:string, kind?:string, isSvg?:boolean}} source
 * @param {string} targetId 'png' | 'jpeg' | 'webp' | 'wav'
 * @param {{quality?:number}} options
 */
export async function convertFile(bytes, source, targetId, { quality = 0.92 } = {}) {
  const fmt = OUTPUT_FORMATS[targetId];
  if (!fmt) throw new DownWiseError('INVALID_INPUT', { message: `unknown target ${targetId}` });

  if (fmt.kind === 'image') {
    if (source.kind !== 'image') throw new DownWiseError('KIND_MISMATCH');
    return convertImage(bytes, source, targetId, quality);
  }
  // fmt.kind === 'audio'
  if (source.kind !== 'audio') throw new DownWiseError('KIND_MISMATCH');
  return convertAudio(bytes);
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
    type: 'DW_OFFSCREEN_CONVERT_IMAGE',
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

async function convertAudio(bytes) {
  const res = await withOffscreen({
    type: 'DW_OFFSCREEN_CONVERT_AUDIO',
    base64: arrayBufferToBase64(bytes),
  });
  return {
    bytes: base64ToBytes(res.base64),
    mime: res.mime,
    info: {
      durationSec: res.durationSec || null,
      sampleRate: res.sampleRate || null,
      channels: res.channels || null,
    },
  };
}

async function finish(blob, targetId, dims) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, mime: OUTPUT_FORMATS[targetId].mime, info: dims };
}
