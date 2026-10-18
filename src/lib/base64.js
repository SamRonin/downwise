/**
 * Base64 helpers that work in window, service worker and Node (tests).
 * Used to transfer binary data through extension messaging, which is
 * JSON-serialized in several Chrome APIs.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function arrayBufferToBase64(buffer) {
  return bytesToBase64(new Uint8Array(buffer));
}

export function base64ToArrayBuffer(b64) {
  return base64ToBytes(b64).buffer;
}
