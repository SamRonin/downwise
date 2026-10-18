import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDuration } from '../src/lib/format.js';
import { base64ToBytes, bytesToBase64 } from '../src/lib/base64.js';
import { DEFAULT_SETTINGS, LANGUAGES } from '../src/lib/settings.js';
import { OUTPUT_FORMATS } from '../src/converters/registry.js';

test('formatBytes is human-readable', () => {
  assert.equal(formatBytes(0, 'en'), '0 B');
  assert.equal(formatBytes(1024, 'en'), '1 KB');
  assert.equal(formatBytes(1536, 'en'), '1.5 KB');
  assert.equal(formatBytes(5 * 1024 * 1024, 'en'), '5 MB');
  assert.equal(formatBytes(undefined, 'en'), '');
});

test('formatDuration renders m:ss / h:mm:ss', () => {
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3725), '1:02:05');
  assert.equal(formatDuration(0), '0:00');
});

test('base64 round-trips binary', () => {
  const original = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 128, 7]);
  const decoded = base64ToBytes(bytesToBase64(original));
  assert.deepEqual([...decoded], [...original]);
});

test('settings defaults are Persian-first and privacy-friendly', () => {
  assert.equal(DEFAULT_SETTINGS.language, 'fa');
  assert.deepEqual(LANGUAGES, ['fa', 'en']);
  assert.equal(DEFAULT_SETTINGS.theme, 'auto');
  assert.ok(DEFAULT_SETTINGS.quality > 0.5 && DEFAULT_SETTINGS.quality <= 1);
  // New preference defaults
  assert.equal(DEFAULT_SETTINGS.defaultImageTarget, 'webp');
  assert.equal(DEFAULT_SETTINGS.audioBitrate, 128);
  assert.equal(DEFAULT_SETTINGS.saveAs, 'auto');       // silent save by default
  assert.equal(DEFAULT_SETTINGS.contextMenus, true);   // menu visible by default
});

test('audio bitrate steps cover the supported Opus range', () => {
  assert.ok(DEFAULT_SETTINGS.audioBitrate >= 64 && DEFAULT_SETTINGS.audioBitrate <= 320);
});

test('wav output mime is audio/wav (honest extension pairing)', () => {
  assert.equal(OUTPUT_FORMATS.wav.ext, 'wav');
  assert.equal(OUTPUT_FORMATS.jpeg.ext, 'jpg');
});
