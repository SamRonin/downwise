/**
 * Minimal 16-bit PCM WAV encoder (RIFF).
 * Pure module — no DOM/audio APIs, so it is unit-tested in Node.
 */

function writeAscii(dv, offset, str) {
  for (let i = 0; i < str.length; i += 1) dv.setUint8(offset + i, str.charCodeAt(i));
}

/**
 * @param {Float32Array[]} channels one array per channel
 * @param {number} sampleRate
 * @returns {ArrayBuffer} complete .wav file
 */
export function encodeWav(channels, sampleRate) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new TypeError('encodeWav: need at least one channel');
  }
  const numChannels = channels.length;
  const numFrames = channels[0].length;
  const dataBytes = numFrames * numChannels * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buffer);

  writeAscii(dv, 0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  writeAscii(dv, 8, 'WAVE');
  writeAscii(dv, 12, 'fmt ');
  dv.setUint32(16, 16, true);        // PCM chunk size
  dv.setUint16(20, 1, true);         // PCM format
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
  dv.setUint16(32, numChannels * 2, true);              // block align
  dv.setUint16(34, 16, true);                           // bits per sample
  writeAscii(dv, 36, 'data');
  dv.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < numFrames; frame += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      let s = channels[ch][frame] || 0;
      s = s < -1 ? -1 : s > 1 ? 1 : s;               // clamp
      dv.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}
