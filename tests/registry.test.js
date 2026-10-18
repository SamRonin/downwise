import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTPUT_FORMATS, availableOutputs, menuOutputsForContext, orderedOutputs, isFrameCapture,
} from '../src/converters/registry.js';
import { toDownWiseError, i18nKeyForCode, DownWiseError, ErrorCodes } from '../src/lib/errors.js';

test('only honestly encodable formats are registered', () => {
  const ids = Object.keys(OUTPUT_FORMATS).sort();
  assert.deepEqual(ids, ['jpeg', 'png', 'wav', 'webm', 'webp']);
});

test('every registered format pairs its mime with the right extension', () => {
  assert.equal(OUTPUT_FORMATS.wav.ext, 'wav');
  assert.equal(OUTPUT_FORMATS.jpeg.ext, 'jpg');
  assert.equal(OUTPUT_FORMATS.webp.ext, 'webp');
  assert.equal(OUTPUT_FORMATS.webm.mime, 'audio/webm');
  assert.equal(OUTPUT_FORMATS.png.mime, 'image/png');
});

test('available outputs match real capabilities per kind', () => {
  assert.deepEqual(availableOutputs('image'), ['png', 'jpeg', 'webp']);
  assert.deepEqual(availableOutputs('video'), ['png', 'jpeg', 'webp']); // frame capture
  assert.deepEqual(availableOutputs('audio'), ['wav', 'webm']);
  // No real encoders exist for these in the browser — must stay empty:
  assert.deepEqual(availableOutputs('document'), []);
  assert.deepEqual(availableOutputs('archive'), []);
  assert.deepEqual(availableOutputs('other'), []);
});

test('orderedOutputs hoists the preferred format without dropping any', () => {
  assert.deepEqual(orderedOutputs('image', 'webp'), ['webp', 'png', 'jpeg']);
  assert.deepEqual(orderedOutputs('image', 'png'), ['png', 'jpeg', 'webp']);
  assert.deepEqual(orderedOutputs('image', null), ['png', 'jpeg', 'webp']);
  assert.deepEqual(orderedOutputs('image', 'wav'), ['png', 'jpeg', 'webp']); // unknown pref ignored
});

test('context menus for links offer no blind conversions', () => {
  assert.deepEqual(menuOutputsForContext('link'), []);
  assert.deepEqual(menuOutputsForContext('video', 'webp'), ['webp', 'png', 'jpeg']);
  assert.deepEqual(menuOutputsForContext('image'), ['png', 'jpeg', 'webp']);
  assert.deepEqual(menuOutputsForContext('audio'), ['wav', 'webm']);
});

test('video context menus are frame captures, image menus are re-encodes', () => {
  assert.equal(isFrameCapture('video', 'png'), true);
  assert.equal(isFrameCapture('video', 'webp'), true);
  assert.equal(isFrameCapture('image', 'png'), false);
  assert.equal(isFrameCapture('audio', 'wav'), false);
});

test('error normalization maps TypeError to CORS', () => {
  const e = toDownWiseError(new TypeError('Failed to fetch'));
  assert.equal(e.code, ErrorCodes.CORS);
  assert.ok(e instanceof DownWiseError);
});

test('every error code has an i18n key defined in both dictionaries', async () => {
  const { fa } = await import('../src/i18n/fa.js');
  const { en } = await import('../src/i18n/en.js');
  for (const code of Object.values(ErrorCodes)) {
    const key = i18nKeyForCode(code);
    assert.ok(fa.errors[code], `fa missing ${key}`);
    assert.ok(en.errors[code], `en missing ${key}`);
  }
});

test('both dictionaries expose every settings & notes label', async () => {
  const { fa } = await import('../src/i18n/fa.js');
  const { en } = await import('../src/i18n/en.js');
  for (const dict of [fa, en]) {
    assert.ok(dict.menu.captureFrame, 'menu.captureFrame missing');
    for (const key of ['defaultImageTarget', 'audioBitrate', 'saveAs', 'contextMenus']) {
      assert.ok(dict.options.download[key], `options.download.${key} missing`);
    }
    assert.ok(dict.notes.frameCapture, 'notes.frameCapture missing');
    assert.ok(dict.notes.webmRealtime, 'notes.webmRealtime missing');
  }
});
