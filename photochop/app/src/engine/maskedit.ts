// Painting into layer masks (0.2.0): an edit session that records the before-state of 64 px
// blocks it is told about and commits one undoable command holding only the changed rectangle's
// before and after bytes; a mask brush with the same dab maths as brush.ts (analytic dab with a
// 1 px rim, union coverage buffer, opacity cap, flow, spacing, pressure, selection); and a bucket.
// Undo and redo emit { kind: 'node', nodeId } so the GL compositor re-uploads the mask and
// autosave rewrites it.
import type { BrushParams, BrushStrokeLike, Command, DocumentLike, MaskEditSession, StrokePoint } from './contract';
import type { Mask, NodeId, Point, Rect, Selection } from './types';
import { requireNode } from './command-util';
import { clamp01, rectUnion } from './util';
import { IntStack, checkMask } from './select/common';

const B = 64;

function clampValue(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0;
}

/** Copies rect r of a mask (or a block store overlay) into a new buffer. */
function readRect(m: Mask, r: Rect): Uint8Array {
  const out = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) out.set(m.data.subarray((y + r.y) * m.w + r.x, (y + r.y) * m.w + r.x + r.w), y * r.w);
  return out;
}

function writeRect(m: Mask, r: Rect, bytes: Uint8Array): void {
  for (let y = 0; y < r.h; y++) m.data.set(bytes.subarray(y * r.w, (y + 1) * r.w), (y + r.y) * m.w + r.x);
}

class MaskPatchCommand implements Command {
  constructor(readonly label: string, private readonly nodeId: NodeId, private readonly rect: Rect,
    private readonly before: Uint8Array, private readonly after: Uint8Array) {}
  do(doc: DocumentLike): void { this.apply(doc, this.after); }
  undo(doc: DocumentLike): void { this.apply(doc, this.before); }
  private apply(doc: DocumentLike, bytes: Uint8Array): void {
    const n = requireNode(doc, this.nodeId);
    if (n.mask && this.rect.w > 0) writeRect(n.mask, this.rect, bytes);
    doc.emit({ kind: 'node', nodeId: this.nodeId });
  }
}

class MaskSession implements MaskEditSession {
  readonly mask: Mask;
  private readonly bw: number;
  private blocks = new Map<number, Uint8Array>();
  private dead = false;

  constructor(private readonly doc: DocumentLike, readonly nodeId: NodeId, mask: Mask) {
    this.mask = mask;
    this.bw = Math.ceil(mask.w / B);
  }

  markRect(rect: Rect): Rect {
    const m = this.mask;
    const x0 = Math.max(0, Math.floor(Math.min(rect.x, rect.x + rect.w)));
    const y0 = Math.max(0, Math.floor(Math.min(rect.y, rect.y + rect.h)));
    const x1 = Math.min(m.w, Math.ceil(Math.max(rect.x, rect.x + rect.w)));
    const y1 = Math.min(m.h, Math.ceil(Math.max(rect.y, rect.y + rect.h)));
    if (x1 <= x0 || y1 <= y0) return { x: x0, y: y0, w: 0, h: 0 };
    for (let by = Math.floor(y0 / B); by <= Math.floor((y1 - 1) / B); by++) {
      for (let bx = Math.floor(x0 / B); bx <= Math.floor((x1 - 1) / B); bx++) {
        const k = by * this.bw + bx;
        if (!this.blocks.has(k)) this.blocks.set(k, readRect(m, this.blockRect(bx, by)));
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Value of pixel (x, y) before this session touched it. */
  beforeAt(x: number, y: number): number {
    const bx = (x / B) | 0, by = (y / B) | 0;
    const blk = this.blocks.get(by * this.bw + bx);
    if (!blk) return this.mask.data[y * this.mask.w + x];
    const r = this.blockRect(bx, by);
    return blk[(y - r.y) * r.w + (x - r.x)];
  }

  flush(_rect?: Rect): void {
    this.doc.emit({ kind: 'node', nodeId: this.nodeId });
  }

  commit(label: string): Command {
    if (this.dead) throw new Error('This edit session has already ended');
    this.dead = true;
    // Tight rectangle of the bytes that really changed.
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    const m = this.mask;
    for (const [k, blk] of this.blocks) {
      const r = this.blockRect(k % this.bw, Math.floor(k / this.bw));
      for (let y = 0; y < r.h; y++) {
        const row = (y + r.y) * m.w + r.x;
        for (let x = 0; x < r.w; x++) {
          if (blk[y * r.w + x] === m.data[row + x]) continue;
          if (x + r.x < x0) x0 = x + r.x;
          if (x + r.x > x1) x1 = x + r.x;
          if (y + r.y < y0) y0 = y + r.y;
          if (y + r.y > y1) y1 = y + r.y;
        }
      }
    }
    const rect = x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    const after = readRect(m, rect);
    const before = new Uint8Array(after.length);
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) before[y * rect.w + x] = this.beforeAt(x + rect.x, y + rect.y);
    this.blocks.clear();
    this.doc.emit({ kind: 'node', nodeId: this.nodeId });
    return new MaskPatchCommand(label, this.nodeId, rect, before, after);
  }

  cancel(): void {
    if (this.dead) return;
    this.dead = true;
    for (const [k, blk] of this.blocks) writeRect(this.mask, this.blockRect(k % this.bw, Math.floor(k / this.bw)), blk);
    this.blocks.clear();
    this.doc.emit({ kind: 'node', nodeId: this.nodeId });
  }

  private blockRect(bx: number, by: number): Rect {
    const x = bx * B, y = by * B;
    return { x, y, w: Math.min(B, this.mask.w - x), h: Math.min(B, this.mask.h - y) };
  }
}

export function beginMaskEdit(doc: DocumentLike, nodeId: NodeId): MaskEditSession {
  const node = doc.getNode(nodeId);
  if (!node) throw new Error('That layer no longer exists');
  if (!node.mask) throw new Error('This layer has no mask');
  checkMask(node.mask, doc.width, doc.height, 'Layer mask');
  return new MaskSession(doc, nodeId, node.mask);
}

// ----- mask brush -----

class MaskStroke implements BrushStrokeLike {
  private cov = new Map<number, Float32Array>();
  private before = new Map<number, Uint8Array>();
  private dirty = new Map<number, Rect>();
  private total: Rect | null = null;
  private last: StrokePoint | null = null;
  private leftover = 0;
  private readonly p: BrushParams;
  private readonly W: number;
  private readonly H: number;
  private readonly bw: number;
  private readonly value: number;

  constructor(private readonly session: MaskEditSession, params: BrushParams, value: number, private readonly sel: Selection | null) {
    this.p = {
      ...params,
      size: Math.max(0.5, Math.min(1000, params.size)),
      hardness: clamp01(params.hardness),
      opacity: clamp01(params.opacity),
      flow: clamp01(params.flow),
      spacing: Math.max(0.01, Math.min(2, params.spacing || 0.1)),
    };
    this.W = session.mask.w;
    this.H = session.mask.h;
    this.bw = Math.ceil(this.W / B);
    this.value = clampValue(value);
    if (sel) checkMask(sel.mask, this.W, this.H, 'Selection');
  }

  begin(pt: StrokePoint): void {
    this.last = pt;
    this.leftover = 0;
    this.dab(pt.x, pt.y, pt.pressure);
    this.apply();
  }

  move(pt: StrokePoint): void {
    if (!this.last) { this.begin(pt); return; }
    const a = this.last;
    const dx = pt.x - a.x, dy = pt.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const step = Math.max(0.5, this.p.spacing * this.p.size);
    let d = step - this.leftover;
    while (d <= len) {
      const t = d / len;
      this.dab(a.x + dx * t, a.y + dy * t, a.pressure + (pt.pressure - a.pressure) * t);
      d += step;
    }
    this.leftover = len - (d - step);
    this.last = pt;
    this.apply();
  }

  end(): Rect | null {
    this.apply();
    this.last = null;
    return this.total;
  }

  private dab(cx: number, cy: number, pressure: number): void {
    const p = this.p;
    const pr = clamp01(pressure);
    const size = Math.max(0.5, p.size * (p.pressureSize ? pr : 1));
    const alpha = p.flow * (p.pressureOpacity ? pr : 1);
    if (alpha <= 0) return;
    const r = size / 2, inner = r * p.hardness, soft = p.hardness < 1;
    const span = r - inner > 1e-6 ? r - inner : 1e-6;
    const lim = (r + 0.5) * (r + 0.5);
    const bx0 = Math.max(0, Math.floor(cx - r - 1)), by0 = Math.max(0, Math.floor(cy - r - 1));
    const bx1 = Math.min(this.W, Math.ceil(cx + r + 1)), by1 = Math.min(this.H, Math.ceil(cy + r + 1));
    if (bx1 <= bx0 || by1 <= by0) return;
    for (let ty = Math.floor(by0 / B); ty <= Math.floor((by1 - 1) / B); ty++) {
      for (let tx = Math.floor(bx0 / B); tx <= Math.floor((bx1 - 1) / B); tx++) {
        const ox = tx * B, oy = ty * B;
        const bwid = Math.min(B, this.W - ox);
        const x0 = Math.max(bx0, ox) - ox, x1 = Math.min(bx1, ox + bwid) - ox;
        const y0 = Math.max(by0, oy) - oy, y1 = Math.min(by1, oy + B, this.H) - oy;
        const k = ty * this.bw + tx;
        let cv = this.cov.get(k);
        if (!cv) {
          cv = new Float32Array(B * B);
          this.cov.set(k, cv);
          const bh = Math.min(B, this.H - oy);
          this.session.markRect({ x: ox, y: oy, w: bwid, h: bh });
          this.before.set(k, readRect(this.session.mask, { x: ox, y: oy, w: bwid, h: bh }));
        }
        let touched = false;
        for (let y = y0; y < y1; y++) {
          const dy = oy + y + 0.5 - cy, dy2 = dy * dy;
          if (dy2 >= lim) continue;
          for (let x = x0; x < x1; x++) {
            const dx = ox + x + 0.5 - cx, d2 = dx * dx + dy2;
            if (d2 >= lim) continue;
            const dist = Math.sqrt(d2);
            let c = r - dist + 0.5;
            if (c > 1) c = 1;
            if (soft && dist > inner) {
              const f = (r - dist) / span;
              if (f < c) c = f;
            }
            if (c <= 0) continue;
            const i = y * B + x;
            cv[i] = 1 - (1 - cv[i]) * (1 - c * alpha);
            touched = true;
          }
        }
        if (!touched) continue;
        const dr = this.dirty.get(k);
        const nr = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        this.dirty.set(k, dr ? (rectUnion(dr, nr) as Rect) : nr);
      }
    }
  }

  private apply(): void {
    if (this.dirty.size === 0) return;
    const op = this.p.opacity, val = this.value;
    const md = this.session.mask.data, W = this.W;
    const sd = this.sel ? this.sel.mask.data : null;
    let moved: Rect | null = null;
    for (const [k, t] of this.dirty) {
      const tx = k % this.bw, ty = Math.floor(k / this.bw);
      const ox = tx * B, oy = ty * B, bwid = Math.min(B, W - ox);
      const cv = this.cov.get(k) as Float32Array, bef = this.before.get(k) as Uint8Array;
      for (let y = t.y; y < t.y + t.h; y++) {
        for (let x = t.x; x < t.x + t.w; x++) {
          let c = cv[y * B + x];
          if (c <= 0) continue;
          const p = (y + oy) * W + x + ox;
          if (sd) {
            if (sd[p] === 0) continue;
            c *= sd[p] / 255;
          }
          const b = bef[y * bwid + x];
          md[p] = Math.round(b + (val - b) * c * op);
        }
      }
      moved = rectUnion(moved, { x: t.x + ox, y: t.y + oy, w: t.w, h: t.h });
    }
    this.dirty.clear();
    if (moved) {
      this.total = rectUnion(this.total, moved);
      this.session.flush(moved);
    }
  }
}

export function createMaskStroke(session: MaskEditSession, params: BrushParams, value: number, selection: Selection | null): BrushStrokeLike {
  return new MaskStroke(session, params, value, selection);
}

// ----- mask bucket -----

export function fillMask(session: MaskEditSession, doc: DocumentLike, at: Point | null, value: number, tolerance: number, contiguous: boolean): Rect | null {
  const m = session.mask, W = m.w, H = m.h;
  checkMask(m, doc.width, doc.height, 'Layer mask');
  const sel = doc.selection;
  if (sel) checkMask(sel.mask, W, H, 'Selection');
  const sd = sel ? sel.mask.data : null;
  const val = clampValue(value);
  const d = m.data;
  const paint = (p: number) => {
    const w = sd ? sd[p] / 255 : 1;
    if (w > 0) d[p] = Math.round(d[p] + (val - d[p]) * w);
  };
  if (!at) {
    const rect = sel ? sel.bounds : { x: 0, y: 0, w: W, h: H };
    const r = session.markRect(rect);
    if (r.w === 0) return null;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) paint(y * W + x);
    session.flush(r);
    return r;
  }
  const ax = Math.floor(at.x), ay = Math.floor(at.y);
  if (!(ax >= 0 && ay >= 0 && ax < W && ay < H)) return null;
  if (sd && sd[ay * W + ax] === 0) return null;
  const tol = Number.isFinite(tolerance) ? Math.max(0, Math.min(255, tolerance)) : 0;
  const seed = d[ay * W + ax];
  const hit = new Uint8Array(W * H);
  const match = (p: number) => Math.abs(d[p] - seed) <= tol;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  if (contiguous) {
    const stack = new IntStack();
    stack.push(ay * W + ax);
    while (stack.length) {
      const p = stack.pop();
      if (hit[p]) continue;
      const y = (p / W) | 0, row = y * W;
      let xl = p - row, xr = xl;
      while (xl > 0 && !hit[row + xl - 1] && match(row + xl - 1)) xl--;
      while (xr < W - 1 && !hit[row + xr + 1] && match(row + xr + 1)) xr++;
      hit.fill(1, row + xl, row + xr + 1);
      if (xl < x0) x0 = xl;
      if (xr > x1) x1 = xr;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let ny = y - 1; ny <= y + 1; ny += 2) {
        if (ny < 0 || ny >= H) continue;
        let inRun = false;
        for (let x = xl; x <= xr; x++) {
          const q = ny * W + x;
          const ok = !hit[q] && match(q);
          if (ok && !inRun) { stack.push(q); inRun = true; } else if (!ok) inRun = false;
        }
      }
    }
  } else {
    for (let p = 0; p < W * H; p++) {
      if (!match(p)) continue;
      hit[p] = 1;
      const y = (p / W) | 0, x = p - y * W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return null;
  const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  session.markRect(rect);
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (hit[y * W + x]) paint(y * W + x);
  session.flush(rect);
  return rect;
}
