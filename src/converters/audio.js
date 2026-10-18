/**
 * Audio conversion via Web Audio decoding + DownWise's own PCM WAV encoder.
 * Runs ONLY inside the offscreen document (service workers have no
 * OfflineAudioContext). decodeAudioData accepts MP3, WAV, OGG/Opus, FLAC,
 * AAC/M4A — and the audio track of MP4/WebM containers.
 */
import { encodeWav } from './wav-encoder.js';
import { DownWiseError } from '../lib/errors.js';

/**
 * @param {Uint8Array} bytes complete audio file
 * @returns {{ wav: ArrayBuffer, durationSec: number, sampleRate: number, channels: number }}
 */
export async function decodeAudioToWav(bytes) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);

  const ctx = new OfflineAudioContext(1, 1, 44100);
  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(copy);
  } catch {
    throw new DownWiseError('DECODE_FAILED');
  }

  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c += 1) {
    channels.push(audioBuffer.getChannelData(c));
  }
  const wav = encodeWav(channels, audioBuffer.sampleRate);
  return {
    wav,
    durationSec: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    channels: audioBuffer.numberOfChannels,
  };
}
