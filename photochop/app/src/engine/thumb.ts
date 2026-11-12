// Small composite previews for the Recent grid and the .photochop thumbnail.
import type { CompositorLike, DocumentLike } from './contract';
import { compositeChildren, compositeDocument, createCpuContext, type Surface } from './compositor/cpu';
import { blobToDataUrl, canCreateCanvas, canvasToBlob, createCanvas, get2d, makeImageData } from './util';

export const THUMB_WIDTH = 160;

/** PNG of the composite scaled to maxW wide (never upscaled). Uses the given compositor or a CPU pass. */
export async function thumbnailBlob(doc: DocumentLike, compositor?: CompositorLike, maxW = THUMB_WIDTH): Promise<Blob | null> {
  if (!canCreateCanvas()) return null;
  let img: ImageData;
  if (compositor) {
    compositor.composite(doc);
    img = compositor.readImageData();
  } else {
    const s = compositeDocument(doc);
    img = makeImageData(s.w, s.h, s.data);
  }
  const src = createCanvas(img.width, img.height);
  get2d(src).putImageData(img, 0, 0);
  const scale = Math.min(1, maxW / doc.width);
  const w = Math.max(1, Math.round(doc.width * scale)), h = Math.max(1, Math.round(doc.height * scale));
  const dst = createCanvas(w, h);
  const ctx = get2d(dst);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
  return canvasToBlob(dst, 'image/png');
}

/** Rows of document pixels composited per slice, so no slice blocks the main thread for long. */
const SLICE_PIXELS = 300_000;

/**
 * The same thumbnail built in horizontal slices with a yield between them (autosave uses this so a
 * 24 MP document never blocks the page for a whole composite). Box-filtered in premultiplied alpha.
 */
export async function thumbnailBlobSliced(doc: DocumentLike, maxW = THUMB_WIDTH): Promise<Blob | null> {
  if (!canCreateCanvas()) return null;
  const W = doc.width, H = doc.height;
  const scale = Math.min(1, maxW / W);
  const tw = Math.max(1, Math.round(W * scale)), th = Math.max(1, Math.round(H * scale));
  const acc = new Float64Array(tw * th * 4);
  const cnt = new Float64Array(tw * th);
  const colOf = new Int32Array(W);
  for (let x = 0; x < W; x++) colOf[x] = Math.min(tw - 1, Math.floor((x * tw) / W));
  const rows = Math.max(1, Math.floor(SLICE_PIXELS / W));
  const ctx = createCpuContext();
  const buf = new Uint8ClampedArray(W * rows * 4);
  for (let y0 = 0; y0 < H; y0 += rows) {
    // Yield before every slice, the first included: callers start this beside other synchronous work.
    await new Promise<void>((r) => setTimeout(r, 0));
    if (doc.width !== W || doc.height !== H) return null;
    const h = Math.min(rows, H - y0);
    const region = { x: 0, y: y0, w: W, h };
    const dst: Surface = { data: buf.subarray(0, W * h * 4), ...region };
    dst.data.fill(0);
    compositeChildren(doc.root.children, dst, region, ctx, 0);
    for (let y = 0; y < h; y++) {
      const trow = Math.min(th - 1, Math.floor(((y0 + y) * th) / H)) * tw;
      let i = y * W * 4;
      for (let x = 0; x < W; x++, i += 4) {
        const t = trow + colOf[x];
        const a = dst.data[i + 3];
        cnt[t]++;
        if (a === 0) continue;
        const k = t * 4;
        acc[k] += dst.data[i] * a; acc[k + 1] += dst.data[i + 1] * a; acc[k + 2] += dst.data[i + 2] * a; acc[k + 3] += a;
      }
    }
  }
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let t = 0; t < tw * th; t++) {
    const a = acc[t * 4 + 3];
    if (a === 0 || cnt[t] === 0) continue;
    out[t * 4] = acc[t * 4] / a; out[t * 4 + 1] = acc[t * 4 + 1] / a; out[t * 4 + 2] = acc[t * 4 + 2] / a;
    out[t * 4 + 3] = a / cnt[t];
  }
  const c = createCanvas(tw, th);
  get2d(c).putImageData(makeImageData(tw, th, out), 0, 0);
  return canvasToBlob(c, 'image/png');
}

export async function thumbnailDataUrl(doc: DocumentLike): Promise<string | undefined> {
  try {
    const b = await thumbnailBlobSliced(doc);
    return b ? await blobToDataUrl(b) : undefined;
  } catch {
    return undefined;
  }
}
