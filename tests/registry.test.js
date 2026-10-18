import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTPUT_FORMATS, availableOutputs, menuOutputsForContext } from '../src/converters/registry.js';
import { toDownWiseError, i18nKeyForCode, DownWiseError, ErrorCodes } from '../src/lib/errors.js';

test('only honestly encodable formats are registered', () => {
  const ids = Object.keys(OUTPUT_FORMATS).sort();
  assert.deepEqual(ids, ['jpeg', 'png', 'wav', 'webp']);
});

test('available outputs match real capabilities per kind', () => {
  assert.deepEqual(availableOutputs('image'), ['png', 'jpeg', 'webp']);
  assert.deepEqual(availableOutputs('audio'), ['wav']);
  // No real encoders exist for these in the browser — must stay empty:
  assert.deepEqual(availableOutputs('video'), []);
  assert.deepEqual(availableOutputs('document'), []);
  assert.deepEqual(availableOutputs('archive'), []);
  assert.deepEqual(availableOutputs('other'), []);
});

test('context menus for links offer no blind conversions', () => {
  assert.deepEqual(menuOutputsForContext('link'), []);
  assert.deepEqual(menuOutputsForContext('video'), []);
  assert.deepEqual(menuOutputsForContext('image'), ['png', 'jpeg', 'webp']);
  assert.deepEqual(menuOutputsForContext('audio'), ['wav']);
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
