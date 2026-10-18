/**
 * Audio conversion via Web Audio decoding + DownWise's own encoders.
 * Runs ONLY inside the offscreen document (service workers have no
 * OfflineAudioContext / MediaRecorder). decodeAudioData accepts MP3, WAV,
 * OGG/Opus, FLAC, AAC/M4A — and the audio track of MP4/WebM containers.
 *
 * Outputs:
 * - WAV  → our own 16-bit PCM encoder (lossless container, large)
 * - WebM → MediaRecorder with the browser's Opus encoder (zero-dependency,
 *          compressed; bitrate selected by the user)
 *
 * Every helper releases its temporary resources deterministically:
 * AudioContext.close(), source.disconnect(), stream track stops — and no
 * object URL is ever left behind.
 */
import { encodeWav } from './wav-encoder.js';
import { DownWiseError } from '../lib/errors.js';

/** Allowed Opus bitrates (kbps) — mirrored in settings & options UI. */
export const AUDIO_BITRATES = Object.freeze([64, 96, 128, 192, 256]);
export const DEFAULT_AUDIO_BITRATE = 128;

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

/**
 * Decode any supported audio container into an AudioBuffer.
 * The OfflineAudioContext used for decoding is released right after.
 * @param {Uint8Array} bytes complete audio file
 */
export async function decodeToAudioBuffer(bytes) {
  // decodeAudioData detaches its input — feed it a private copy.
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);

  const ctx = new OfflineAudioContext(1, 1, 44100);
  try {
    const buffer = await ctx.decodeAudioData(copy);
    return buffer;
  } catch {
    throw new DownWiseError('DECODE_FAILED');
  }
  // OfflineAudioContext has no close(); the context is garbage-collected
  // once this scope exits because no nodes or callbacks reference it.
}

/**
 * Encode a decoded AudioBuffer as 16-bit PCM WAV.
 * @returns {{ wav: ArrayBuffer, durationSec: number, sampleRate: number, channels: number }}
 */
export function audioBufferToWav(audioBuffer) {
  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c += 1) {
    channels.push(audioBuffer.getChannelData(c));
  }
  const wav = encodeWav(channels, audioBuffer.sampleRate);
  // Release the large Float32 channel views as soon as possible.
  channels.length = 0;
  return {
    wav,
    durationSec: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    channels: audioBuffer.numberOfChannels,
  };
}

/**
 * Encode a decoded AudioBuffer as WebM/Opus with MediaRecorder.
 * The recorder taps a MediaStreamDestination, so encoding happens in
 * real-time (length of the audio); it is the honest zero-dependency path
 * to a compressed format Chromium can natively produce.
 *
 * @param {AudioBuffer} audioBuffer
 * @param {{ bitrateKbps?: number }} options
 * @returns {Promise<{ blob: Blob, mime: string, bitrateKbps: number }>}
 */
export function audioBufferToWebmOpus(audioBuffer, { bitrateKbps = DEFAULT_AUDIO_BITRATE } = {}) {
  const mime = pickRecorderMime();
  if (!mime) {
    throw new DownWiseError('CONVERSION_FAILED', { message: 'MediaRecorder (audio/webm;codecs=opus) unavailable' });
  }
  const bps = Math.max(6000, Math.round(Number(bitrateKbps) || DEFAULT_AUDIO_BITRATE) * 1000);

  return new Promise((resolve, reject) => {
    let ctx = null;
    let source = null;
    let recorder = null;
    let settled = false;
    let stopTimer = null;

    // Deterministic teardown of every temporary resource.
    const cleanup = () => {
      if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
      try { source?.disconnect(); } catch { /* already disconnected */ }
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch { /* already stopped */ }
      try { ctx?.close(); } catch { /* already closed */ }
      ctx = null;
      source = null;
      recorder = null;
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof DownWiseError ? err : new DownWiseError('CONVERSION_FAILED', { message: err?.message }));
    };

    try {
      ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);

      recorder = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: bps });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onerror = (e) => fail(new DownWiseError('CONVERSION_FAILED', { message: e?.error?.message || 'MediaRecorder error' }));

      recorder.onstop = () => {
        try {
          const blob = new Blob(chunks, { type: mime.split(';')[0] });
          chunks.length = 0;
          if (!blob.size) throw new DownWiseError('CONVERSION_FAILED', { message: 'empty recorder output' });
          settled = true;
          cleanup();
          resolve({ blob, mime: mime.split(';')[0], bitrateKbps: Math.round(bps / 1000) });
        } catch (err) {
          fail(err);
        }
      };

      // Play the whole buffer through the graph while recording.
      source.onended = () => {
        // Small tail so the final Opus frames are flushed before stop().
        stopTimer = setTimeout(() => {
          try { if (recorder && recorder.state === 'recording') recorder.stop(); } catch (e) { fail(e); }
        }, 120);
      };

      recorder.start();
      source.start();
    } catch (err) {
      fail(err);
    }
  });
}

/**
 * Back-compat helper: decode + WAV in one call.
 * @param {Uint8Array} bytes
 */
export async function decodeAudioToWav(bytes) {
  const audioBuffer = await decodeToAudioBuffer(bytes);
  return audioBufferToWav(audioBuffer);
}
