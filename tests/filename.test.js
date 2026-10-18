import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeFilename, baseNameFromUrl, replaceExtension, ensureExtension,
} from '../src/lib/filename.js';

test('sanitize removes illegal filesystem characters', () => {
  assert.equal(sanitizeFilename('photo:*?"<>|1.jpg'), 'photo 1.jpg');
  assert.equal(sanitizeFilename('  spaced   out .png '), 'spaced out .png');
  assert.equal(sanitizeFilename(''), 'file');
  assert.equal(sanitizeFilename('...'), 'file');
});

test('sanitize preserves Unicode (Persian) names', () => {
  assert.equal(sanitizeFilename('تصویر-۱.png'), 'تصویر-۱.png');
});

test('baseNameFromUrl strips query and hash', () => {
  assert.equal(baseNameFromUrl('https://cdn.x.com/img/beautiful-photo.png?token=1#frag'), 'beautiful-photo.png');
  assert.equal(baseNameFromUrl('https://x.com/'), 'file-x.com');
  assert.equal(baseNameFromUrl('data:image/png;base64,AA'), 'file');
  assert.equal(baseNameFromUrl('::bad::'), 'file');
});

test('replaceExtension swaps only the last extension', () => {
  assert.equal(replaceExtension('photo.png', 'webp'), 'photo.webp');
  assert.equal(replaceExtension('photo', 'jpg'), 'photo.jpg');
  assert.equal(replaceExtension('archive.tar.gz', 'zip'), 'archive.tar.zip');
  assert.equal(replaceExtension('weird name.PNG', 'jpeg'), 'weird name.jpeg');
});

test('ensureExtension adds only when missing', () => {
  assert.equal(ensureExtension('a', 'zip'), 'a.zip');
  assert.equal(ensureExtension('a.zip', 'zip'), 'a.zip');
});
