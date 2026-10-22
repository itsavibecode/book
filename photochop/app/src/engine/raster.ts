// Bitmap -> raster node, and bitmap -> document.
import type { DocumentLike } from './contract';
import type { RasterNode } from './types';
import { createRasterNode, Document } from './document';
import { createCanvas, get2d } from './util';

function pixelsOf(src: ImageBitmap | HTMLCanvasElement | ImageData): ImageData {
  if ('data' in src) return src;
  const c = createCanvas(src.width, src.height);
  const ctx = get2d(c);
  ctx.drawImage(src as CanvasImageSource, 0, 0);
  return ctx.getImageData(0, 0, src.width, src.height);
}

export function rasterFromBitmap(bitmap: ImageBitmap | HTMLCanvasElement | ImageData, name: string, x = 0, y = 0): RasterNode {
  const node = createRasterNode(name);
  node.x = Math.round(x);
  node.y = Math.round(y);
  if (bitmap.width > 0 && bitmap.height > 0) {
    node.tiles.write(pixelsOf(bitmap), 0, 0);
    node.tiles.prune();
  }
  return node;
}

export function documentFromBitmap(bitmap: ImageBitmap, name: string): DocumentLike {
  const base = name.replace(/\.[^./\\]+$/, '').trim() || 'Untitled';
  const doc = new Document({ name: base, width: bitmap.width, height: bitmap.height });
  const node = rasterFromBitmap(bitmap, base);
  doc.root.children.push(node);
  doc.activeId = node.id;
  doc.selectedIds = [node.id];
  return doc;
}
