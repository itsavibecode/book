// Selection to and from image files (0.2.0).
import type { DocumentLike } from '@/engine/contract';
import type { Mask } from '@/engine/types';
import { decodePng, encodePng, pngBlob } from '@/engine/png';
import { createCanvas, get2d } from '@/engine/util';

/** The selection as an 8-bit greyscale PNG at document size (white = selected), via the engine's own encoder. */
export async function exportSelection(doc: DocumentLike): Promise<Blob> {
  const sel = doc.selection;
  if (!sel) throw new Error('There is no selection to export');
  const m = sel.mask;
  if (m.w !== doc.width || m.h !== doc.height) throw new Error(`Selection is ${m.w} x ${m.h} but the document is ${doc.width} x ${doc.height}`);
  return pngBlob(encodePng(m.data, m.w, m.h, 1));
}

/** Greyscale (luminance times alpha) of an RGBA buffer. */
function greyOf(rgba: Uint8Array | Uint8ClampedArray, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const lum = 0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2];
    out[i] = Math.round((lum * rgba[j + 3]) / 255);
  }
  return out;
}

/** Bilinear resize of a grey buffer, pixel centres aligned. */
export function resizeGrey(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  const kx = sw / dw, ky = sh / dh;
  for (let y = 0; y < dh; y++) {
    let v = (y + 0.5) * ky - 0.5;
    if (v < 0) v = 0;
    const y0 = Math.min(sh - 1, Math.floor(v)), y1 = Math.min(sh - 1, y0 + 1), fy = v - y0;
    for (let x = 0; x < dw; x++) {
      let u = (x + 0.5) * kx - 0.5;
      if (u < 0) u = 0;
      const x0 = Math.min(sw - 1, Math.floor(u)), x1 = Math.min(sw - 1, x0 + 1), fx = u - x0;
      const top = src[y0 * sw + x0] + (src[y0 * sw + x1] - src[y0 * sw + x0]) * fx;
      const bot = src[y1 * sw + x0] + (src[y1 * sw + x1] - src[y1 * sw + x0]) * fx;
      out[y * dw + x] = Math.round(top + (bot - top) * fy);
    }
  }
  return out;
}

async function decodeGrey(file: File | Blob): Promise<{ w: number; h: number; grey: Uint8Array }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // PNGs PhotoChop can read exactly (its own exports included) skip the browser's premultiplied path.
  if (bytes.length > 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    try {
      const p = decodePng(bytes);
      return { w: p.w, h: p.h, grey: p.channels === 1 ? p.data : greyOf(p.data, p.w * p.h) };
    } catch {
      // Fall through to the browser decoder (16-bit, palette or interlaced PNGs).
    }
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('This file could not be read as an image');
  }
  try {
    const c = createCanvas(bmp.width, bmp.height);
    const ctx = get2d(c);
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return { w: bmp.width, h: bmp.height, grey: greyOf(img.data, bmp.width * bmp.height) };
  } finally {
    bmp.close();
  }
}

/** Any image as a selection mask (luminance times alpha), scaled to the document with bilinear when sizes differ. */
export async function importSelection(file: File | Blob, doc: DocumentLike): Promise<Mask> {
  const { w, h, grey } = await decodeGrey(file);
  if (w < 1 || h < 1) throw new Error('This image is empty');
  const W = doc.width, H = doc.height;
  const data = w === W && h === H ? grey : resizeGrey(grey, w, h, W, H);
  return { w: W, h: H, data };
}
