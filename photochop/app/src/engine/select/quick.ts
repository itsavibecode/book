// Quick selection: every brush dab grows a region from its centre. Inside the dab circle a pixel
// joins when its colour is within twice the tolerance of the centre colour; beyond the circle the
// region may spill up to three radii (plus 16 px) further, but only through pixels within the
// tolerance, and it never continues past a strong luminance or alpha edge (Sobel). The composite
// and its gradient are read once at creation; each stroke touches only its own window.
import type { CompositorLike, DocumentLike, QuickSelectLike } from '../contract';
import type { Mask, NodeId, Point } from '../types';
import { createMask } from '../selection';
import { IntStack, readSource, sobel } from './common';

class QuickSelect implements QuickSelectLike {
  readonly mask: Mask;
  private readonly src: Uint8ClampedArray;
  private readonly grad: Uint16Array;
  private readonly W: number;
  private readonly H: number;
  private readonly tol: number;
  private readonly edge: number;
  private seen = new Uint8Array(0);
  private stack = new IntStack();

  constructor(compositor: CompositorLike, doc: DocumentLike, opts: { sampleAllLayers: boolean; nodeId?: NodeId; tolerance: number }) {
    this.W = doc.width;
    this.H = doc.height;
    this.mask = createMask(this.W, this.H);
    this.src = readSource(compositor, doc, opts.sampleAllLayers, opts.nodeId);
    this.grad = sobel(this.src, this.W, this.H);
    const t = Number.isFinite(opts.tolerance) ? opts.tolerance : 32;
    this.tol = Math.max(0, Math.min(255, t));
    // A step of about the tolerance in luminance gives a Sobel response of 4x the step.
    this.edge = Math.max(24, this.tol * 4);
  }

  stroke(p: Point, radius: number): void {
    const W = this.W, H = this.H;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    if (!(cx >= 0 && cy >= 0 && cx < W && cy < H)) return;
    const r = Math.max(0.5, Number.isFinite(radius) ? radius : 1);
    const R = Math.ceil(r * 3 + 16);
    const x0 = Math.max(0, cx - R), x1 = Math.min(W, cx + R + 1);
    const y0 = Math.max(0, cy - R), y1 = Math.min(H, cy + R + 1);
    const ww = x1 - x0, wh = y1 - y0;
    if (this.seen.length < ww * wh) this.seen = new Uint8Array(ww * wh);
    const seen = this.seen;
    seen.fill(0, 0, ww * wh);
    const src = this.src, grad = this.grad, out = this.mask.data;
    const si = (cy * W + cx) * 4;
    const sr = src[si], sg = src[si + 1], sb = src[si + 2], sa = src[si + 3];
    const tolIn = Math.min(255, this.tol * 2), tolOut = this.tol, edge = this.edge;
    const r2 = r * r, R2 = R * R;
    const stack = this.stack;
    stack.length = 0;
    stack.push((cy - y0) * ww + (cx - x0));
    seen[(cy - y0) * ww + (cx - x0)] = 1;
    while (stack.length) {
      const li = stack.pop();
      const ly = (li / ww) | 0, lx = li - ly * ww;
      const x = lx + x0, y = ly + y0;
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const inside = d2 <= r2;
      const p4 = (y * W + x) * 4;
      // Colour test against the dab centre (alpha only when either side is clear).
      const a = src[p4 + 3];
      let diff = a > sa ? a - sa : sa - a;
      if (sa !== 0 && a !== 0) {
        const dr = src[p4] > sr ? src[p4] - sr : sr - src[p4];
        const dg = src[p4 + 1] > sg ? src[p4 + 1] - sg : sg - src[p4 + 1];
        const db = src[p4 + 2] > sb ? src[p4 + 2] - sb : sb - src[p4 + 2];
        if (dr > diff) diff = dr;
        if (dg > diff) diff = dg;
        if (db > diff) diff = db;
      }
      if (diff > (inside ? tolIn : tolOut)) continue;
      out[y * W + x] = 255;
      if (!inside && grad[y * W + x] >= edge) continue;
      for (let k = 0; k < 4; k++) {
        let nx = lx, ny = ly;
        if (k === 0) nx--; else if (k === 1) nx++; else if (k === 2) ny--; else ny++;
        if (nx < 0 || ny < 0 || nx >= ww || ny >= wh) continue;
        const ni = ny * ww + nx;
        if (seen[ni]) continue;
        const ddx = nx + x0 - cx, ddy = ny + y0 - cy;
        if (ddx * ddx + ddy * ddy > R2) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
  }
}

export function createQuickSelect(
  compositor: CompositorLike, doc: DocumentLike, opts: { sampleAllLayers: boolean; nodeId?: NodeId; tolerance: number },
): QuickSelectLike {
  return new QuickSelect(compositor, doc, opts);
}
