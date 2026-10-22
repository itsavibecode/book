// Rasterised text and shape content, cached per node. The cache key is a signature of every
// prop that changes the pixels, so moving a node (x/y) never re-rasterises it.
import type { NodeId, ShapeNode, TextNode } from '../types';
import { measureText, rasterizeText } from '../text';
import { rasterizeShape, shapeBounds } from '../shape';

/** A straight-alpha RGBA buffer placed in document space. */
export interface Surface {
  data: Uint8ClampedArray;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContentEntry {
  /** Node-space origin of the raster. */
  bx: number;
  by: number;
  w: number;
  h: number;
  data: Uint8ClampedArray | null;
  /** Bumps whenever the pixels change, so GPU uploads can follow. */
  rev: number;
}

export function contentSignature(n: TextNode | ShapeNode): string {
  if (n.type === 'text') {
    return ['t', n.text, n.font, n.size, n.weight, n.italic, n.color.join(','), n.align, n.lineHeight,
      n.letterSpacing, n.width].join('|');
  }
  return ['s', n.shape, n.w, n.h, n.radius, n.fill?.join(',') ?? '', n.stroke?.join(',') ?? '', n.strokeWidth].join('|');
}

let revCounter = 0;

export class ContentCache {
  private map = new Map<NodeId, { sig: string; entry: ContentEntry }>();

  entry(n: TextNode | ShapeNode): ContentEntry {
    const sig = contentSignature(n);
    const hit = this.map.get(n.id);
    if (hit && hit.sig === sig) return hit.entry;
    let entry: ContentEntry;
    if (n.type === 'text') {
      const img = rasterizeText(n);
      const b = measureText(n);
      entry = img ? { bx: b.x, by: b.y, w: img.width, h: img.height, data: img.data, rev: ++revCounter }
        : { bx: 0, by: 0, w: 0, h: 0, data: null, rev: ++revCounter };
    } else {
      const img = rasterizeShape(n);
      const b = shapeBounds(n);
      entry = img ? { bx: b.x, by: b.y, w: img.width, h: img.height, data: img.data, rev: ++revCounter }
        : { bx: 0, by: 0, w: 0, h: 0, data: null, rev: ++revCounter };
    }
    this.map.set(n.id, { sig, entry });
    return entry;
  }

  /** Document-space surface of the node's content, or null when it draws nothing. */
  surface(n: TextNode | ShapeNode): Surface | null {
    const e = this.entry(n);
    if (!e.data) return null;
    return { data: e.data, x: Math.round(n.x) + e.bx, y: Math.round(n.y) + e.by, w: e.w, h: e.h };
  }

  delete(id: NodeId): void {
    this.map.delete(id);
  }

  clear(): void {
    this.map.clear();
  }
}

/** Shared cache for commands (rasterise, merge, flatten) and thumbnails. */
export const sharedContentCache = new ContentCache();
