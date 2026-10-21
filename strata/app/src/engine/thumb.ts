// Small composite previews for the Recent grid and the .strata thumbnail.
import type { CompositorLike, DocumentLike } from './contract';
import { compositeDocument } from './compositor/cpu';
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

export async function thumbnailDataUrl(doc: DocumentLike): Promise<string | undefined> {
  try {
    const b = await thumbnailBlob(doc);
    return b ? await blobToDataUrl(b) : undefined;
  } catch {
    return undefined;
  }
}
