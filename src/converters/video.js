/**
 * Video frame capture (Poster / Capture Frame).
 * Loads the video in the offscreen document's DOM, seeks to the requested
 * timestamp and rasterizes exactly one frame onto a canvas — the only honest
 * zero-dependency way to get a real PNG/JPEG/WebP still out of a video.
 *
 * Runs ONLY inside the offscreen document (needs <video> + 2D canvas).
 * All temporary resources (object URL, video element, canvas) are released
 * deterministically in `cleanup`, on success AND on failure.
 */
import { OUTPUT_FORMATS } from './registry.js';
import { DownWiseError } from '../lib/errors.js';

/** Never let pathological inputs allocate huge canvases. */
const MAX_FRAME_SIDE = 8192;
const FRAME_TIMEOUT_MS = 30_000;

/**
 * @param {Blob} blob complete video file
 * @param {'png'|'jpeg'|'webp'} target image output id
 * @param {{ quality?: number, atSeconds?: number }} options
 *   atSeconds: frame position; 0 = poster (first frame). Clamped to the
 *   video duration. NaN/Infinity fall back to 0.
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export function extractVideoFrame(blob, target, { quality = 0.92, atSeconds = 0 } = {}) {
  const fmt = OUTPUT_FORMATS[target];
  if (!fmt || fmt.kind !== 'image') {
    return Promise.reject(new TypeError(`unknown image target: ${target}`));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    let settled = false;
    let failTimer = null;

    // ---- deterministic resource cleanup (success & failure paths) --------
    const cleanup = () => {
      if (failTimer) { clearTimeout(failTimer); failTimer = null; }
      video.onloadeddata = null;
      video.onerror = null;
      try { video.pause(); } catch { /* not playing */ }
      video.removeAttribute('src'); // release the media pipeline + decoder
      try { video.load(); } catch { /* already reset */ }
      video.remove();
      URL.revokeObjectURL(url); // free the blob reference immediately
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof DownWiseError
        ? err
        : new DownWiseError('CONVERSION_FAILED', { message: err?.message || String(err) }));
    };

    const succeed = (frameBlob, width, height) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ blob: frameBlob, width, height });
    };

    // Broken containers can stall forever — never leak the whole pipeline.
    failTimer = setTimeout(
      () => fail(new DownWiseError('CONVERSION_FAILED', { message: 'video frame timeout' })),
      FRAME_TIMEOUT_MS,
    );

    const drawFrame = () => {
      try {
        const rawW = video.videoWidth || 0;
        const rawH = video.videoHeight || 0;
        if (!rawW || !rawH) {
          throw new DownWiseError('CONVERSION_FAILED', { message: 'video has no raster frame' });
        }
        const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(rawW, rawH));
        const width = Math.max(1, Math.round(rawW * scale));
        const height = Math.max(1, Math.round(rawH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new DownWiseError('CONVERSION_FAILED', { message: '2D context unavailable' });
        if (target === 'jpeg') {
          ctx.fillStyle = '#ffffff'; // JPEG has no alpha — flatten onto white
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(video, 0, 0, width, height);
        // Free the canvas backing store before the blob encode settles.
        canvas.width = 0;
        canvas.height = 0;
        canvas.toBlob(
          (b) => (b
            ? succeed(b, width, height)
            : fail(new DownWiseError('CONVERSION_FAILED', { message: 'canvas.toBlob failed' }))),
          fmt.mime,
          target === 'png' ? undefined : quality,
        );
      } catch (err) {
        fail(err);
      }
    };

    // NOTE: requestAnimationFrame is throttled/paused in offscreen (hidden)
    // documents, so we draw directly — drawImage reads the decoded frame
    // straight from the media pipeline, no compositor round-trip needed.
    const onReady = () => {
      try {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const requested = Number(atSeconds);
        let at = Number.isFinite(requested) && requested > 0 ? requested : 0;
        if (duration > 0) at = Math.min(at, Math.max(0, duration - 0.05));

        // Already parked at the requested position? No `seeked` event will
        // fire — draw immediately. (Covers the poster case and repeats.)
        if (Math.abs(video.currentTime - at) < 0.001) {
          drawFrame();
        } else {
          video.addEventListener('seeked', () => drawFrame(), { once: true });
          video.currentTime = at;
        }
      } catch (err) {
        fail(err);
      }
    };

    video.onerror = () => fail(new DownWiseError('CONVERSION_FAILED', { message: 'video could not be decoded' }));
    video.onloadeddata = onReady;
    video.src = url;
  });
}
