import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mimeFromExt, extFromUrl, kindFromMime, isStreamManifestUrl, supportedScheme, normalizeMime,
} from '../src/lib/mime.js';

test('mime lookup is case-insensitive and complete', () => {
  assert.equal(mimeFromExt('PNG'), 'image/png');
  assert.equal(mimeFromExt('jpg'), 'image/jpeg');
  assert.equal(mimeFromExt('pdf'), 'application/pdf');
  assert.equal(mimeFromExt(''), '');
});

test('extFromUrl reads the last path segment, ignoring query/hash', () => {
  assert.equal(extFromUrl('https://cdn.example.com/a/b/Photo.JPG?w=200#x'), 'jpg');
  assert.equal(extFromUrl('https://example.com/'), '');
  assert.equal(extFromUrl('data:image/png;base64,AAAA'), '');
});

test('kindFromMime classifies correctly', () => {
  assert.equal(kindFromMime('image/webp'), 'image');
  assert.equal(kindFromMime('video/mp4'), 'video');
  assert.equal(kindFromMime('audio/mpeg'), 'audio');
  assert.equal(kindFromMime('application/pdf'), 'document');
  assert.equal(kindFromMime('application/zip'), 'archive');
  assert.equal(kindFromMime('text/html'), 'html');
  assert.equal(kindFromMime('application/vnd.apple.mpegurl'), 'stream');
  assert.equal(kindFromMime('application/octet-stream'), 'other');
  assert.equal(kindFromMime(''), 'other');
});

test('normalizeMime strips parameters', () => {
  assert.equal(normalizeMime('image/jpeg; charset=binary'), 'image/jpeg');
});

test('stream manifests are detected', () => {
  assert.ok(isStreamManifestUrl('https://x.com/live/index.m3u8?token=1'));
  assert.ok(isStreamManifestUrl('https://x.com/video.mpd'));
  assert.ok(!isStreamManifestUrl('https://x.com/video.mp4'));
});

test('scheme allow-list', () => {
  assert.ok(supportedScheme('https://x.com/a.png'));
  assert.ok(supportedScheme('http://x.com/a.png'));
  assert.ok(supportedScheme('data:image/png;base64,AA'));
  assert.ok(supportedScheme('blob:https://x.com/1234'));
  assert.ok(!supportedScheme('chrome://extensions'));
  assert.ok(!supportedScheme('file:///etc/passwd'));
  assert.ok(!supportedScheme('not a url'));
});
