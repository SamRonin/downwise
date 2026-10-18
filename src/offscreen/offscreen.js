/**
 * Offscreen document worker.
 * Receives conversion requests from the service worker over runtime
 * messaging and answers with base64 payloads (JSON-safe transport).
 * Only DW_OFFSCREEN_* messages are handled; everything else is ignored so
 * the popup/options pages never collide with us.
 */
import { convertRasterImage, convertSvgImage } from '../converters/image.js';
import { decodeAudioToWav } from '../converters/audio.js';
import { OUTPUT_FORMATS } from '../converters/registry.js';
import { base64ToBytes, arrayBufferToBase64 } from '../lib/base64.js';
import { sniffType } from '../lib/sniff.js';
import { DownWiseError } from '../lib/errors.js';

const OFFSCREEN_PREFIX = 'DW_OFFSCREEN_';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith(OFFSCREEN_PREFIX)) return false;

  handle(msg)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => {
      const e = err instanceof DownWiseError ? err : new DownWiseError('OFFSCREEN_FAILED', { message: err?.message });
      sendResponse({ ok: false, code: e.code, message: e.message });
    });
  return true; // keep the channel open for the async response
});

async function handle(msg) {
  switch (msg.type) {
    case `${OFFSCREEN_PREFIX}PING`:
      return { pong: true };

    case `${OFFSCREEN_PREFIX}CONVERT_IMAGE`:
      return convertImage(msg);

    case `${OFFSCREEN_PREFIX}CONVERT_AUDIO`:
      return convertAudio(msg);

    case `${OFFSCREEN_PREFIX}MAKE_BLOB_URL`: {
      // Service workers cannot create blob URLs — the offscreen document can.
      const blob = new Blob([base64ToBytes(msg.base64)], { type: msg.mime || 'application/octet-stream' });
      return { url: URL.createObjectURL(blob) };
    }

    case `${OFFSCREEN_PREFIX}REVOKE_BLOB_URL`:
      if (typeof msg.url === 'string') URL.revokeObjectURL(msg.url);
      return { revoked: true };

    default:
      throw new DownWiseError('INVALID_INPUT', { message: `unknown offscreen request: ${msg.type}` });
  }
}

async function convertImage({ base64, mime = '', target, quality }) {
  const bytes = base64ToBytes(base64);
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  const isSvg = sniffType(bytes.subarray(0, Math.min(bytes.length, 1024)))?.ext === 'svg';
  const result = isSvg
    ? await convertSvgImage(blob, target, { quality })
    : await convertRasterImage(blob, target, { quality });
  const outBytes = new Uint8Array(await result.blob.arrayBuffer());
  return {
    base64: arrayBufferToBase64(outBytes),
    mime: OUTPUT_FORMATS[target].mime,
    size: outBytes.byteLength,
    width: result.width || null,
    height: result.height || null,
  };
}

async function convertAudio({ base64 }) {
  const bytes = base64ToBytes(base64);
  const { wav, durationSec, sampleRate, channels } = await decodeAudioToWav(bytes);
  return {
    base64: arrayBufferToBase64(wav),
    mime: OUTPUT_FORMATS.wav.mime,
    size: wav.byteLength,
    durationSec,
    sampleRate,
    channels,
  };
}
