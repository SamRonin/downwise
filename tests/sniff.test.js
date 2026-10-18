import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffType } from '../src/lib/sniff.js';

const bytes = (...vals) => Uint8Array.from(vals);
const asciiBytes = (str) => Uint8Array.from([...str].map((c) => c.charCodeAt(0)));

test('detects PNG signature', () => {
  const b = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.deepEqual(sniffType(b), { ext: 'png', mime: 'image/png', kind: 'image' });
});

test('detects JPEG', () => {
  const b = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.equal(sniffType(b).ext, 'jpg');
});

test('detects GIF', () => {
  assert.equal(sniffType(asciiBytes('GIF89a;' + 'x'.repeat(20))).ext, 'gif');
});

test('detects WebP via RIFF/WEBP', () => {
  const b = asciiBytes('RIFF' + '\x00\x00\x00\x00' + 'WEBPVP8 ');
  assert.equal(sniffType(b).ext, 'webp');
});

test('detects WAV via RIFF/WAVE', () => {
  const b = asciiBytes('RIFF' + '\x00\x00\x00\x00' + 'WAVEfmt ');
  assert.equal(sniffType(b).ext, 'wav');
});

test('detects AVIF brand', () => {
  const b = asciiBytes('\x00\x00\x00\x20' + 'ftyp' + 'avif' + 'mif1');
  assert.equal(sniffType(b).ext, 'avif');
});

test('detects MP4 brand', () => {
  const b = asciiBytes('\x00\x00\x00\x20' + 'ftyp' + 'isom' + 'iso2');
  assert.equal(sniffType(b).ext, 'mp4');
});

test('detects WebM via EBML + doctype', () => {
  const b = asciiBytes('\x1a\x45\xdf\xa3' + '\x42\x82\x88webm\x42\xf7\x81');
  assert.equal(sniffType(b).ext, 'webm');
});

test('detects PDF', () => {
  assert.equal(sniffType(asciiBytes('%PDF-1.7\n%âãÏÓ')).ext, 'pdf');
});

test('detects MP3 (ID3 and frame sync)', () => {
  assert.equal(sniffType(asciiBytes('ID3\x04\x00\x00\x00\x00\x00\x00')).ext, 'mp3');
  assert.equal(sniffType(bytes(0xff, 0xfb, 0x90, 0x00)).ext, 'mp3');
});

test('detects OGG and FLAC', () => {
  assert.equal(sniffType(asciiBytes('OggS\x00\x02')).ext, 'ogg');
  assert.equal(sniffType(asciiBytes('fLaC\x00\x00')).ext, 'flac');
});

test('detects ZIP and DOCX flavor', () => {
  const zip = asciiBytes('PK\x03\x04' + '\x14\x00\x00\x00' + '\x00\x00\x00\x00');
  assert.equal(sniffType(zip).ext, 'zip');
  const docx = asciiBytes('PK\x03\x04\x14\x00\x00\x00\x00\x00[word/document.xml]');
  assert.equal(sniffType(docx).ext, 'docx');
});

test('detects 7z and RAR', () => {
  assert.equal(sniffType(bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)).ext, '7z');
  assert.equal(sniffType(asciiBytes('Rar!\x1a\x07')).ext, 'rar');
});

test('detects HTML pages (the hotlink-protection trap)', () => {
  const b = asciiBytes('<!DOCTYPE html>\n<html lang="en"><body>403</body>');
  assert.deepEqual(sniffType(b), { ext: 'html', mime: 'text/html', kind: 'html' });
  const b2 = asciiBytes('<HTML><BODY>login</BODY></HTML>');
  assert.equal(sniffType(b2).kind, 'html');
});

test('detects SVG markup', () => {
  const b = asciiBytes('<svg xmlns="http://www.w3.org/2000/svg" width="10"><rect/></svg>');
  assert.equal(sniffType(b).ext, 'svg');
});

test('an HTML page with an inline <svg> is still HTML (no false positive)', () => {
  const b = asciiBytes('<html><body><svg width="1"><rect/></svg></body></html>');
  assert.equal(sniffType(b).kind, 'html');
  const b2 = asciiBytes('<!DOCTYPE html><svg><rect/></svg>');
  assert.equal(sniffType(b2).kind, 'html');
});

test('detects HLS manifests as stream', () => {
  const b = asciiBytes('#EXTM3U\n#EXT-X-VERSION:3\nseg-1.ts');
  assert.equal(sniffType(b).kind, 'stream');
});

test('returns null for unknown bytes', () => {
  assert.equal(sniffType(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16)), null);
  assert.equal(sniffType(null), null);
});
