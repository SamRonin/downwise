import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MSG, OFFSCREEN_PREFIX, isOffscreenMessage, createRouter } from '../src/lib/messages.js';

test('every message type is unique and DW_-prefixed', () => {
  const values = Object.values(MSG);
  assert.equal(new Set(values).size, values.length, 'message types must be unique');
  for (const value of values) {
    assert.match(value, /^DW_/);
  }
});

test('offscreen messages carry the reserved prefix', () => {
  for (const [key, value] of Object.entries(MSG)) {
    if (key.startsWith('OFFSCREEN_')) {
      assert.ok(value.startsWith(OFFSCREEN_PREFIX), `${key} must start with ${OFFSCREEN_PREFIX}`);
      assert.ok(isOffscreenMessage(value));
    } else {
      assert.ok(!isOffscreenMessage(value), `${key} must NOT be treated as offscreen`);
    }
  }
});

test('isOffscreenMessage rejects non-strings and unknown prefixes', () => {
  assert.equal(isOffscreenMessage(undefined), false);
  assert.equal(isOffscreenMessage(42), false);
  assert.equal(isOffscreenMessage('DW_PING'), false);
  assert.equal(isOffscreenMessage('DW_OFFSCREEN_CONVERT_AUDIO'), true);
});

test('the message catalogue itself is frozen', () => {
  assert.equal(Object.isFrozen(MSG), true);
  assert.throws(() => { 'use strict'; MSG.PING = 'X'; });
});

test('createRouter dispatches to the right handler and wraps payloads', async () => {
  const router = createRouter({
    [MSG.PING]: () => ({ pong: true }),
    [MSG.GET_STATE]: async () => ({ jobs: [1, 2] }),
  });

  let replied = null;
  const sendResponse = (r) => { replied = r; };
  const keepOpen = router({ type: MSG.PING }, {}, sendResponse);
  assert.equal(keepOpen, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(replied, { ok: true, pong: true });

  router({ type: MSG.GET_STATE }, {}, sendResponse);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(replied, { ok: true, jobs: [1, 2] });
});

test('createRouter ignores unknown/invalid types (falls through)', () => {
  const router = createRouter({});
  assert.equal(router(null, {}, () => {}), false);
  assert.equal(router({}, {}, () => {}), false);
  assert.equal(router({ type: 'DW_UNKNOWN' }, {}, () => {}), false);
});

test('createRouter converts handler errors into ok:false responses', async () => {
  const errors = [];
  const router = createRouter({
    [MSG.RETRY]: async () => { throw Object.assign(new Error('nope'), { code: 'CORS' }); },
  }, { onError: (err) => errors.push(err) });

  let replied = null;
  router({ type: MSG.RETRY }, {}, (r) => { replied = r; });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(replied.ok, false);
  assert.equal(replied.code, 'CORS');
  assert.equal(replied.message, 'nope');
  assert.equal(errors.length, 1);
});
