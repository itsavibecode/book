// CPU compositor: the fallback on devices without WebGL2, and the reference the GL path is tested
// against. Works on straight-alpha RGBA8 buffers and restricts work to the dirty rect.
import type { CompositeOptions, CompositorLike, DocumentLike } from '../contract';
import { TILE, type AnyNode, type Mask, type NodeId, type Rect } from '../types';
import { canCreateCanvas, createCanvas, get2d, makeImageData, rectIntersect, rectOuter, type Canvas } from '../util';
import { blendIndex, blendPixel } from './blend';
import { ContentCache, sharedContentCache, type Surface } from './content';

export type { Surface } from './content';

/** Scratch buffers for group isolation, one per nesting depth, reused between composites. */
class ScratchPool {
  private bufs: Uint8ClampedArray[] = [];
  get(depth: number, len: number): Uint8ClampedArray {
    let b = this.bufs[depth];
    if (!b || b.length !== len) {
      b = new Uint8ClampedArray(len);
      this.bufs[depth] = b;
    }
    return b;
  }
  clear(): void {
    this.bufs = [];
  }
}

export interface CpuContext {
  cache: ContentCache;
  pool: ScratchPool;
}

export function createCpuContext(cache: ContentCache = sharedContentCache): CpuContext {
  return { cache, pool: new ScratchPool() };
}

export function clearRegion(s: Surface, r: Rect): void {
  const x0 = Math.max(r.x, s.x), x1 = Math.min(r.x + r.w, s.x + s.w);
  const y0 = Math.max(r.y, s.y), y1 = Math.min(r.y + r.h, s.y + s.h);
  if (x1 <= x0 || y1 <= y0) return;
  for (let y = y0; y < y1; y++) {
    const i = ((y - s.y) * s.w + (x0 - s.x)) * 4;
    s.data.fill(0, i, i + (x1 - x0) * 4);
  }
}

/**
 * Blends src over dst inside region (all document space). opacity 0..1; mask is document-sized
 * and multiplies the source alpha (pixels outside the mask count as hidden).
 */
export function blendSurface(dst: Surface, src: Surface, region: Rect, opacity: number, mask: Mask | null, mode: number): void {
  const x0 = Math.max(region.x, src.x, dst.x);
  const x1 = Math.min(region.x + region.w, src.x + src.w, dst.x + dst.w);
  const y0 = Math.max(region.y, src.y, dst.y);
  const y1 = Math.min(region.y + region.h, src.y + src.h, dst.y + dst.h);
  if (x1 <= x0 || y1 <= y0 || opacity <= 0) return;
  const s = src.data, d = dst.data;
  const md = mask ? mask.data : null;
  const mw = mask ? mask.w : 0, mh = mask ? mask.h : 0;
  for (let y = y0; y < y1; y++) {
    let si = ((y - src.y) * src.w + (x0 - src.x)) * 4;
    let di = ((y - dst.y) * dst.w + (x0 - dst.x)) * 4;
    const rowOut = md !== null && (y < 0 || y >= mh);
    if (rowOut) continue;
    const mrow = y * mw;
    for (let x = x0; x < x1; x++, si += 4, di += 4) {
      const a8 = s[si + 3];
      if (a8 === 0) continue;
      let sa = (a8 / 255) * opacity;
      if (md !== null) {
        if (x < 0 || x >= mw) continue;
        const m = md[mrow + x];
        if (m === 0) continue;
        sa *= m / 255;
      }
      blendPixel(d, di, s[si] / 255, s[si + 1] / 255, s[si + 2] / 255, sa, mode);
    }
  }
}

/** The surfaces that make up a non-group node's content, filtered to those touching region. */
export function nodeSurfaces(node: AnyNode, region: Rect, ctx: CpuContext): Surface[] {
  if (node.type === 'raster') {
    const out: Surface[] = [];
    const nx = Math.round(node.x), ny = Math.round(node.y);
    node.tiles.forEach((buf, tx, ty) => {
      const x = nx + tx * TILE, y = ny + ty * TILE;
      if (x >= region.x + region.w || y >= region.y + region.h || x + TILE <= region.x || y + TILE <= region.y) return;
      out.push({ data: buf, x, y, w: TILE, h: TILE });
    });
    return out;
  }
  if (node.type === 'text' || node.type === 'shape') {
    const s = ctx.cache.surface(node);
    return s ? [s] : [];
  }
  return [];
}

export function effectiveMask(node: AnyNode): Mask | null {
  return node.mask && node.maskEnabled ? node.mask : null;
}

export function compositeChildren(children: AnyNode[], dst: Surface, region: Rect, ctx: CpuContext, depth: number): void {
  for (const child of children) {
    if (!child.visible || child.opacity <= 0) continue;
    drawNode(child, dst, region, ctx, depth, child.opacity, effectiveMask(child), blendIndex(child.blend));
  }
}

export function drawNode(node: AnyNode, dst: Surface, region: Rect, ctx: CpuContext, depth: number,
  opacity: number, mask: Mask | null, mode: number): void {
  if (node.type === 'group') {
    // Groups are isolated: children composite into a transparent scratch, which then blends as one layer.
    const scratch: Surface = { data: ctx.pool.get(depth, dst.data.length), x: dst.x, y: dst.y, w: dst.w, h: dst.h };
    clearRegion(scratch, region);
    compositeChildren(node.children, scratch, region, ctx, depth + 1);
    blendSurface(dst, scratch, region, opacity, mask, mode);
    return;
  }
  for (const s of nodeSurfaces(node, region, ctx)) blendSurface(dst, s, region, opacity, mask, mode);
}

/** Node content alone (no own opacity, blend or mask) into a fresh surface covering region. */
export function renderContent(node: AnyNode, region: Rect, ctx: CpuContext): Surface {
  const dst: Surface = { data: new Uint8ClampedArray(region.w * region.h * 4), x: region.x, y: region.y, w: region.w, h: region.h };
  if (node.type === 'group') compositeChildren(node.children, dst, region, ctx, 1);
  else drawNode(node, dst, region, ctx, 1, 1, null, 0);
  return dst;
}

/** Whole-document composite at document size. */
export function compositeDocument(doc: DocumentLike, ctx: CpuContext = createCpuContext()): Surface {
  const region = { x: 0, y: 0, w: doc.width, h: doc.height };
  const dst: Surface = { data: new Uint8ClampedArray(doc.width * doc.height * 4), ...region };
  compositeChildren(doc.root.children, dst, region, ctx, 0);
  return dst;
}

export class CpuCompositor implements CompositorLike {
  readonly kind = 'cpu' as const;
  private W = 0;
  private H = 0;
  private image: ImageData = makeImageData(0, 0);
  private surf: Surface = { data: new Uint8ClampedArray(0), x: 0, y: 0, w: 0, h: 0 };
  private _canvas: Canvas | null = null;
  private ctx2d: ReturnType<typeof get2d> | null = null;
  private ctx: CpuContext = createCpuContext(new ContentCache());

  get canvas(): HTMLCanvasElement | OffscreenCanvas {
    if (!this._canvas) {
      this._canvas = createCanvas(Math.max(1, this.W), Math.max(1, this.H));
      this.ctx2d = get2d(this._canvas);
      if (this.W > 0 && this.H > 0) this.ctx2d.putImageData(this.image, 0, 0);
    }
    return this._canvas;
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    if (w === this.W && h === this.H) return;
    this.W = w;
    this.H = h;
    this.image = makeImageData(w, h);
    this.surf = { data: this.image.data, x: 0, y: 0, w, h };
    this.ctx.pool.clear();
    if (this._canvas) {
      this._canvas.width = w;
      this._canvas.height = h;
      this.ctx2d = get2d(this._canvas);
    }
  }

  composite(doc: DocumentLike, opts: CompositeOptions = {}): void {
    if (doc.width !== this.W || doc.height !== this.H) this.resize(doc.width, doc.height);
    const full = { x: 0, y: 0, w: this.W, h: this.H };
    const region = opts.dirty ? rectIntersect(rectOuter(opts.dirty), full) : full;
    if (!region) return;
    clearRegion(this.surf, region);
    compositeChildren(doc.root.children, this.surf, region, this.ctx, 0);
    if (!this._canvas && canCreateCanvas()) void this.canvas;
    if (this.ctx2d) this.ctx2d.putImageData(this.image, 0, 0, region.x, region.y, region.w, region.h);
  }

  readImageData(rect?: Rect): ImageData {
    const r = rect ? rectOuter(rect) : { x: 0, y: 0, w: this.W, h: this.H };
    const out = new Uint8ClampedArray(r.w * r.h * 4);
    const ix = rectIntersect(r, { x: 0, y: 0, w: this.W, h: this.H });
    if (ix) {
      for (let y = ix.y; y < ix.y + ix.h; y++) {
        const s = (y * this.W + ix.x) * 4;
        out.set(this.surf.data.subarray(s, s + ix.w * 4), ((y - r.y) * r.w + (ix.x - r.x)) * 4);
      }
    }
    return makeImageData(r.w, r.h, out);
  }

  /** Content of one node alone at document size, without its own opacity, blend or mask (like a layer thumbnail). */
  renderNode(doc: DocumentLike, id: NodeId): ImageData {
    const node = doc.getNode(id);
    const region = { x: 0, y: 0, w: doc.width, h: doc.height };
    if (!node) return makeImageData(doc.width, doc.height);
    const s = renderContent(node, region, this.ctx);
    return makeImageData(doc.width, doc.height, s.data);
  }

  dispose(): void {
    this.ctx.cache.clear();
    this.ctx.pool.clear();
    this._canvas = null;
    this.ctx2d = null;
  }
}
