/**
 * Real image conversion built on Chromium's own codecs.
 * - Raster inputs (PNG/JPEG/WebP/AVIF/GIF/BMP/ICO…): OffscreenCanvas + createImageBitmap
 *   (works in the service worker AND in any DOM context).
 * - SVG inputs need an HTMLImageElement → handled in the offscreen document.
 * Only the first frame of animated images is rasterized (documented honestly).
 */
import { OUTPUT_FORMATS } from './registry.js';

/** Decode any raster blob to a bitmap (EXIF-orientation aware). */
export async function decodeToBitmap(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // Some formats (e.g. certain SVG/ICO variants) reject createImageBitmap.
    return null;
  }
}

function encodeCanvas(canvas, target, quality) {
  const fmt = OUTPUT_FORMATS[target];
  return canvas.convertToBlob({
    type: fmt.mime,
    quality: target === 'png' ? undefined : quality,
  });
}

/** Convert a raster blob to PNG/JPEG/WebP. Throws on undecodable input. */
export async function convertRasterImage(blob, target, { quality = 0.92 } = {}) {
  const fmt = OUTPUT_FORMATS[target];
  if (!fmt || fmt.kind !== 'image') throw new TypeError(`unknown image target: ${target}`);

  const bmp = await decodeToBitmap(blob);
  if (!bmp) throw new TypeError('createImageBitmap failed for this input');

  const width = Math.max(1, bmp.width || 1);
  const height = Math.max(1, bmp.height || 1);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new TypeError('2D context unavailable');

  if (target === 'jpeg') {
    ctx.fillStyle = '#ffffff'; // JPEG has no alpha — flatten onto white
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bmp, 0, 0, width, height);
  if (typeof bmp.close === 'function') bmp.close();

  const out = await encodeCanvas(canvas, target, quality);
  return { blob: out, width, height };
}

/** Parse intrinsic size/aspect from SVG markup (for sizeless SVGs). */
export function parseSvgIntrinsicSize(text) {
  const vb = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  const wAttr = /\bwidth\s*=\s*["']\s*([\d.]+)/i.exec(text);
  const hAttr = /\bheight\s*=\s*["']\s*([\d.]+)/i.exec(text);
  let width = wAttr ? Number(wAttr[1]) : 0;
  let height = hAttr ? Number(hAttr[1]) : 0;
  if (vb && width > 0 && height > 0) return { width, height };
  const aspect = vb ? Number(vb[3]) / Number(vb[4]) : 0;
  if (aspect > 0) {
    width = 1024;
    height = Math.round(1024 / aspect);
  }
  return { width, height, aspect };
}

const MAX_RASTER_SIDE = 4096;

/**
 * Rasterize an SVG blob — requires a DOM context (offscreen document).
 * `fallbackSize` ({width,height,aspect}) comes from parsing the markup and is
 * used when the image reports no intrinsic size. Small SVGs are upscaled up
 * to 1024px so icons don't export at 24px.
 */
export function rasterizeSvgBlob(blob, target, { quality = 0.92, targetWidth = 1024, fallbackSize = null } = {}) {
  const fmt = OUTPUT_FORMATS[target];
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = async () => {
      try {
        let width = img.naturalWidth || img.width || fallbackSize?.width || 0;
        let height = img.naturalHeight || img.height || fallbackSize?.height || 0;
        if (!width || !height) {
          if (fallbackSize?.aspect) {
            width = targetWidth;
            height = Math.max(1, Math.round(targetWidth / fallbackSize.aspect));
          } else {
            width = targetWidth;
            height = targetWidth;
          }
        }
        if (width < targetWidth) {
          height = Math.round((height * targetWidth) / width);
          width = targetWidth;
        }
        const scale = Math.min(1, MAX_RASTER_SIDE / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new TypeError('2D context unavailable');
        if (target === 'jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outBlob = await new Promise((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new TypeError('canvas.toBlob failed'))), fmt.mime,
            target === 'png' ? undefined : quality));
        resolve({ blob: outBlob, width, height });
      } catch (err) {
        reject(err);
      } finally {
        cleanup();
      }
    };
    img.onerror = () => {
      cleanup();
      reject(new TypeError('SVG could not be loaded as an image'));
    };
    img.src = url;
  });
}

/** Combined SVG path: markup is read first so sizeless SVGs keep their aspect. */
export async function convertSvgImage(blob, target, options = {}) {
  const text = await blob.text();
  const fallbackSize = parseSvgIntrinsicSize(text);
  return rasterizeSvgBlob(blob, target, { ...options, fallbackSize });
}
