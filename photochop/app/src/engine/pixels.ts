// Selection-clipped pixel copies for Copy / Copy merged (0.2.0).
import type { CompositorLike, DocumentLike } from './contract';
import type { NodeId, Rect } from './types';
import { makeImageData, rectIntersect } from './util';
import { nodeDocBounds } from './document';
import { checkMask, readSource } from './select/common';

/**
 * The pixels of one node (its own content, without its opacity, blend or mask) or of the
 * composite (nodeId null), multiplied by the selection's coverage and trimmed to the tight bounds
 * of what is left. Document space only. null when nothing would be copied.
 */
export function copyPixels(compositor: CompositorLike, doc: DocumentLike, nodeId: NodeId | null): { image: ImageData; x: number; y: number } | null {
  const W = doc.width, H = doc.height;
  const sel = doc.selection;
  if (sel) checkMask(sel.mask, W, H, 'Selection');
  let region: Rect | null = sel ? rectIntersect(sel.bounds, { x: 0, y: 0, w: W, h: H }) : { x: 0, y: 0, w: W, h: H };
  let data: Uint8ClampedArray;
  let stride: number;
  let ox: number, oy: number;
  if (nodeId) {
    const node = doc.getNode(nodeId);
    if (!node) throw new Error('That layer no longer exists');
    const nb = nodeDocBounds(node);
    region = region && nb ? rectIntersect(region, nb) : null;
    if (!region) return null;
    if (node.type === 'raster') {
      data = node.tiles.read({ x: region.x - Math.round(node.x), y: region.y - Math.round(node.y), w: region.w, h: region.h }).data;
      stride = region.w; ox = region.x; oy = region.y;
    } else {
      data = compositor.renderNode(doc, nodeId).data;
      stride = W; ox = 0; oy = 0;
    }
  } else {
    if (!region) return null;
    data = readSource(compositor, doc, true);
    stride = W; ox = 0; oy = 0;
  }
  const r = region;
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1;
  const md = sel ? sel.mask.data : null;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const j = ((y + r.y - oy) * stride + (x + r.x - ox)) * 4;
      let a = data[j + 3];
      if (md) a = Math.round((a * md[(y + r.y) * W + x + r.x]) / 255);
      if (a === 0) continue;
      const k = (y * r.w + x) * 4;
      out[k] = data[j]; out[k + 1] = data[j + 1]; out[k + 2] = data[j + 2]; out[k + 3] = a;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const trimmed = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const s = ((y + y0) * r.w + x0) * 4;
    trimmed.set(out.subarray(s, s + tw * 4), y * tw * 4);
  }
  return { image: makeImageData(tw, th, trimmed), x: r.x + x0, y: r.y + y0 };
}
