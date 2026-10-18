/**
 * Offscreen document worker.
 * Receives conversion requests from the service worker over runtime
 * messaging and answers with base64 payloads (JSON-safe transport).
 * Only DW_OFFSCREEN_* messages are handled; everything else is ignored so
 * the popup/options pages never collide with us.
 *
 * Lifecycle: the service worker closes this document after 30 s of idle
 * time, so every handler must leave zero lingering resources — the
 * converters revoke object URLs, close AudioContexts and drop canvases
 * themselves; this router additionally drops large byte references as
 * soon as a response has been serialized.
 */
import { convertRasterImage, convertSvgImage } from '../converters/image.js';
import {
  decodeToAudioBuffer, audioBufferToWav, audioBufferToWebmOpus, DEFAULT_AUDIO_BITRATE,
} from '../converters/audio.js';
import { extractVideoFrame } from '../converters/video.js';
import { OUTPUT_FORMATS } from '../converters/registry.js';
import { base64ToBytes, arrayBufferToBase64 } from '../lib/base64.js';
import { sniffType } from '../lib/sniff.js';
import { DownWiseError } from '../lib/errors.js';
import { MSG, isOffscreenMessage, createRouter } from '../lib/messages.js';

const listener = createRouter({
  [MSG.OFFSCREEN_PING]: () => ({ pong: true }),

  [MSG.OFFSCREEN_CONVERT_IMAGE]: (msg) => convertImage(msg),

  [MSG.OFFSCREEN_CONVERT_AUDIO]: (msg) => convertAudio(msg),

  [MSG.OFFSCREEN_CONVERT_VIDEO_FRAME]: (msg) => convertVideoFrame(msg),

  [MSG.OFFSCREEN_MAKE_BLOB_URL]: (msg) => {
    // Service workers cannot create blob URLs — the offscreen document can.
    const blob = new Blob([base64ToBytes(msg.base64)], { type: msg.mime || 'application/octet-stream' });
    return { url: URL.createObjectURL(blob) };
  },

  [MSG.OFFSCREEN_REVOKE_BLOB_URL]: (msg) => {
    if (typeof msg.url === 'string') URL.revokeObjectURL(msg.url);
    return { revoked: true };
  },
}, {
  onError: (err) => {
    const e = err instanceof DownWiseError ? err : new DownWiseError('OFFSCREEN_FAILED', { message: err?.message });
    console.error('DownWise offscreen task failed:', e.code, e.message);
  },
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isOffscreenMessage(msg?.type)) return false;
  return listener(msg, sender, sendResponse);
});

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

async function convertAudio({ base64, target = 'wav', bitrateKbps }) {
  const bytes = base64ToBytes(base64);
  const audioBuffer = await decodeToAudioBuffer(bytes);

  if (target === 'webm') {
    const { blob, mime } = await audioBufferToWebmOpus(audioBuffer, {
      bitrateKbps: bitrateKbps || DEFAULT_AUDIO_BITRATE,
    });
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    return {
      base64: arrayBufferToBase64(outBytes),
      mime,
      size: outBytes.byteLength,
      durationSec: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
    };
  }

  const { wav } = audioBufferToWav(audioBuffer);
  return {
    base64: arrayBufferToBase64(wav),
    mime: OUTPUT_FORMATS.wav.mime,
    size: wav.byteLength,
    durationSec: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    channels: audioBuffer.numberOfChannels,
  };
}

async function convertVideoFrame({ base64, mime = '', target, quality, atSeconds }) {
  const bytes = base64ToBytes(base64);
  const blob = new Blob([bytes], { type: mime || 'video/mp4' });
  const result = await extractVideoFrame(blob, target, { quality, atSeconds });
  const outBytes = new Uint8Array(await result.blob.arrayBuffer());
  return {
    base64: arrayBufferToBase64(outBytes),
    mime: OUTPUT_FORMATS[target].mime,
    size: outBytes.byteLength,
    width: result.width || null,
    height: result.height || null,
  };
}
