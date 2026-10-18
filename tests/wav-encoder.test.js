import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '../src/converters/wav-encoder.js';

function ascii(dv, offset, len) {
  let s = '';
  for (let i = 0; i < len; i += 1) s += String.fromCharCode(dv.getUint8(offset + i));
  return s;
}

test('encodes a valid 16-bit PCM WAV header', () => {
  const ch = Float32Array.from([0, 0.25, -0.5, 1]);
  const wav = encodeWav([ch], 44100);
  const dv = new DataView(wav);

  assert.equal(ascii(dv, 0, 4), 'RIFF');
  assert.equal(ascii(dv, 8, 4), 'WAVE');
  assert.equal(ascii(dv, 12, 4), 'fmt ');
  assert.equal(dv.getUint32(16, true), 16);
  assert.equal(dv.getUint16(20, true), 1); // PCM
  assert.equal(dv.getUint16(22, true), 1); // mono
  assert.equal(dv.getUint32(24, true), 44100);
  assert.equal(dv.getUint32(28, true), 44100 * 2);
  assert.equal(dv.getUint16(32, true), 2);
  assert.equal(dv.getUint16(34, true), 16);
  assert.equal(ascii(dv, 36, 4), 'data');
  assert.equal(dv.getUint32(40, true), 8); // 4 frames × 1ch × 2 bytes
  assert.equal(wav.byteLength, 44 + 8);
});

test('interleaves stereo channels and clamps', () => {
  const l = Float32Array.from([1.5, -1.5]);
  const r = Float32Array.from([0.5, -0.25]);
  const dv = new DataView(encodeWav([l, r], 48000));

  assert.equal(dv.getUint16(22, true), 2); // stereo
  assert.equal(dv.getInt16(44, true), 32767);    // clamped +
  assert.equal(dv.getInt16(46, true), 16383);    // 0.5 → ~16383
  assert.equal(dv.getInt16(48, true), -32768);   // clamped −
  assert.equal(dv.getInt16(50, true), -8192);    // −0.25 → −8192
});

test('rejects empty channel lists', () => {
  assert.throws(() => encodeWav([], 44100), TypeError);
});
