import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fa } from '../src/i18n/fa.js';
import { en } from '../src/i18n/en.js';
import { t, dirOf, getDict } from '../src/i18n/index.js';

/** Collect leaf paths of a nested dictionary. */
function leafPaths(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') out.push(...leafPaths(value, path));
    else out.push(path);
  }
  return out;
}

test('fa and en dictionaries have identical keys', () => {
  const faKeys = leafPaths(fa).sort();
  const enKeys = leafPaths(en).sort();
  assert.deepEqual(enKeys, faKeys);

  const faSet = new Set(faKeys);
  const missingInFa = enKeys.filter((k) => !faSet.has(k));
  assert.deepEqual(missingInFa, [], `keys missing in fa: ${missingInFa.join(', ')}`);
});

test('all leaf values are non-empty strings', () => {
  for (const [lang, dict] of [['fa', fa], ['en', en]]) {
    for (const path of leafPaths(dict)) {
      const value = path.split('.').reduce((n, k) => n?.[k], dict);
      assert.equal(typeof value, 'string', `${lang}:${path} is not a string`);
      assert.ok(value.length > 0, `${lang}:${path} is empty`);
    }
  }
});

test('t() interpolates {params}', () => {
  assert.ok(t('fa', 'menu.convertTo', { format: 'PNG' }).includes('PNG'));
  assert.ok(t('en', 'menu.convertTo', { format: 'WebP' }).includes('WebP'));
  assert.ok(t('en', 'notify.doneBody', { name: 'cat.png' }).includes('cat.png'));
});

test('t() falls back fa ⇄ en and never crashes on unknown keys', () => {
  assert.equal(t('fa', 'nonexistent.key'), 'nonexistent.key');
  assert.equal(dirOf('fa'), 'rtl');
  assert.equal(dirOf('en'), 'ltr');
  assert.equal(getDict('xx').meta.code, 'fa'); // unknown → default fa
});

test('every status/kind/error enum used by the pipeline has a dict entry', () => {
  const statuses = [
    'queued', 'preparing', 'fetching', 'converting', 'saving',
    'downloading', 'completed', 'failed', 'canceled', 'action_required',
  ];
  const kinds = ['image', 'video', 'audio', 'document', 'archive', 'html', 'stream', 'other'];
  for (const lang of ['fa', 'en']) {
    for (const s of statuses) {
      assert.equal(typeof t(lang, `status.${s}`), 'string');
      assert.ok(!t(lang, `status.${s}`).includes('status.'), `status.${s} missing in ${lang}`);
    }
    for (const k of kinds) {
      assert.ok(t(lang, `kind.${k}`) !== `kind.${k}`, `kind.${k} missing in ${lang}`);
    }
  }
});
