import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filenameFromContentDisposition, extFromFilename } from '../src/lib/content-disposition.js';

test('parses a simple quoted filename', () => {
  assert.equal(filenameFromContentDisposition('attachment; filename="report.pdf"'), 'report.pdf');
  assert.equal(extFromFilename('report.pdf'), 'pdf');
});

test('parses an unquoted token filename', () => {
  assert.equal(filenameFromContentDisposition('attachment; filename=archive.zip'), 'archive.zip');
});

test('filename* (RFC 5987) wins over plain filename', () => {
  const header = 'attachment; filename="fallback.jpg"; filename*=UTF-8\'\'img%20%C3%A9.png';
  assert.equal(filenameFromContentDisposition(header), 'img é.png');
});

test('decodes UTF-8 percent-encoded Persian names', () => {
  // تصویر.png
  const header = "attachment; filename*=UTF-8''%D8%AA%D8%B5%D9%88%DB%8C%D8%B1.png";
  assert.equal(filenameFromContentDisposition(header), 'تصویر.png');
});

test('handles utf-8 double-quoted ext-value variants some servers emit', () => {
  const header = "attachment; filename=\"utf-8''%D8%B9%DA%A9%D8%B3.jpg\"";
  assert.equal(filenameFromContentDisposition(header), 'عکس.jpg');
});

test('decodes RFC 2047 encoded-words (legacy servers)', () => {
  // =?UTF-8?B?2q/Ystin2LHYtC5wZGY=?= is the base64 of "گزارش.pdf"
  assert.equal(filenameFromContentDisposition('attachment; filename="=?UTF-8?B?2q/Ystin2LHYtC5wZGY?="'), 'گزارش.pdf');
});

test('strips directory paths (URI and Windows fakes)', () => {
  assert.equal(filenameFromContentDisposition('attachment; filename="/var/www/secret.zip"'), 'secret.zip');
  assert.equal(filenameFromContentDisposition('attachment; filename="C:\\\\fakepath\\\\photo.jpg"'), 'photo.jpg');
  assert.equal(filenameFromContentDisposition('attachment; filename="..\\\\..\\\\evil.txt"'), 'evil.txt');
});

test('removes control characters and trims quotes/dots', () => {
  assert.equal(filenameFromContentDisposition('attachment; filename="bad\u0000\u0007name.png"'), 'badname.png');
  assert.equal(filenameFromContentDisposition('attachment; filename="file.zip."'), 'file.zip');
  assert.equal(filenameFromContentDisposition('attachment; filename="\'.png"'), '.png');
});

test('handles unescapes backslash-escaped quotes', () => {
  assert.equal(filenameFromContentDisposition('attachment; filename="the \\"big\\" one.webm"'), 'the "big" one.webm');
});

test('returns null for missing/empty/garbage headers', () => {
  assert.equal(filenameFromContentDisposition(null), null);
  assert.equal(filenameFromContentDisposition(''), null);
  assert.equal(filenameFromContentDisposition('inline'), null);
  assert.equal(filenameFromContentDisposition('attachment; filename=""'), null);
});

test('latin-1 filename* falls back to utf-8 decoding without crashing', () => {
  const header = "attachment; filename*=iso-8859-1''na%EFve%20file.txt";
  const name = filenameFromContentDisposition(header);
  assert.match(name, /na/);
  assert.equal(extFromFilename(name), 'txt');
});

test('extracts clean extensions for common types', () => {
  assert.equal(extFromFilename('photo.JPEG'), 'jpeg');
  assert.equal(extFromFilename('no-extension'), '');
  assert.equal(extFromFilename('archive.tar.gz'), 'gz');
  assert.equal(extFromFilename('.hidden'), '');
});
