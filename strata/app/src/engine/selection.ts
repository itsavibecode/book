// Document-space masks for selections and layer masks.
import type { DocumentLike } from './contract';
import { TILE, type Mask, type NodeId, type Rect, type Selection } from './types';
import { createCpuContext, renderContent } from './compositor/cpu';

export function createMask(w: number, h: number, fill = 0): Mask {
  const mw = Math.max(0, Math.round(w)), mh = Math.max(0, Math.round(h));
  const data = new Uint8Array(mw * mh);
  if (fill) data.fill(Math.max(0, Math.min(255, Math.round(fill))));
  return { w: mw, h: mh, data };
}

function norm(rect: Rect): Rect {
  return {
    x: Math.min(rect.x, rect.x + rect.w), y: Math.min(rect.y, rect.y + rect.h),
    w: Math.abs(rect.w), h: Math.abs(rect.h),
  };
}

export function rectMask(w: number, h: number, rect: Rect): Mask {
  const m = createMask(w, h);
  const r = norm(rect);
  const x0 = Math.max(0, Math.round(r.x)), x1 = Math.min(m.w, Math.round(r.x + r.w));
  const y0 = Math.max(0, Math.round(r.y)), y1 = Math.min(m.h, Math.round(r.y + r.h));
  for (let y = y0; y < y1; y++) m.data.fill(255, y * m.w + x0, y * m.w + x1);
  return m;
}

const SS = 4;

/** Antialiased ellipse inscribed in rect, 4x4 supersampled. */
export function ellipseMask(w: number, h: number, rect: Rect): Mask {
  const m = createMask(w, h);
  const r = norm(rect);
  if (r.w <= 0 || r.h <= 0) return m;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2, ry = r.h / 2;
  const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(m.w, Math.ceil(r.x + r.w));
  const y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(m.h, Math.ceil(r.y + r.h));
  const half = new Float64Array(SS);
  for (let y = y0; y < y1; y++) {
    // Half-width of the ellipse at each sub-row, so the inner loop is a range test.
    for (let s = 0; s < SS; s++) {
      const dy = (y + (s + 0.5) / SS - cy) / ry;
      half[s] = dy * dy < 1 ? rx * Math.sqrt(1 - dy * dy) : -1;
    }
    const row = y * m.w;
    for (let x = x0; x < x1; x++) {
      let n = 0;
      for (let s = 0; s < SS; s++) {
        const hw = half[s];
        if (hw < 0) continue;
        for (let t = 0; t < SS; t++) {
          const dx = x + (t + 0.5) / SS - cx;
          if (dx >= -hw && dx <= hw) n++;
        }
      }
      if (n) m.data[row + x] = Math.round((n * 255) / (SS * SS));
    }
  }
  return m;
}

export function combineMasks(a: Mask | null, b: Mask, op: 'replace' | 'add' | 'subtract' | 'intersect'): Mask {
  if (op === 'replace' || (!a && op === 'add')) return { w: b.w, h: b.h, data: b.data.slice() };
  if (!a) return createMask(b.w, b.h);
  if (a.w !== b.w || a.h !== b.h) throw new Error('Masks must be the same size to combine');
  const out = new Uint8Array(a.data.length);
  const ad = a.data, bd = b.data;
  if (op === 'add') for (let i = 0; i < out.length; i++) out[i] = ad[i] > bd[i] ? ad[i] : bd[i];
  else if (op === 'subtract') for (let i = 0; i < out.length; i++) { const v = 255 - bd[i]; out[i] = ad[i] < v ? ad[i] : v; }
  else for (let i = 0; i < out.length; i++) out[i] = ad[i] < bd[i] ? ad[i] : bd[i];
  return { w: a.w, h: a.h, data: out };
}

export function invertMask(m: Mask): Mask {
  const out = new Uint8Array(m.data.length);
  for (let i = 0; i < out.length; i++) out[i] = 255 - m.data[i];
  return { w: m.w, h: m.h, data: out };
}

export function maskBounds(m: Mask): Rect | null {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  const d = m.data;
  for (let y = 0; y < m.h; y++) {
    const row = y * m.w;
    let first = -1, last = -1;
    for (let x = 0; x < m.w; x++) if (d[row + x]) { first = x; break; }
    if (first < 0) continue;
    for (let x = m.w - 1; x >= first; x--) if (d[row + x]) { last = x; break; }
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function selectionFromMask(m: Mask): Selection | null {
  const bounds = maskBounds(m);
  return bounds ? { mask: m, bounds } : null;
}

export function selectAll(doc: DocumentLike): Selection {
  return { mask: createMask(doc.width, doc.height, 255), bounds: { x: 0, y: 0, w: doc.width, h: doc.height } };
}

/**
 * Pixel-edge outline: every edge between a pixel above 127 and one at or below 127 (outside the
 * mask counts as below), as unit segments merged into horizontal and vertical runs.
 */
export function maskOutline(m: Mask): Float32Array {
  const { w, h, data } = m;
  const out: number[] = [];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] > 127;
  // Horizontal edges on the line y, between rows y-1 and y.
  for (let y = 0; y <= h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && inside(x, y - 1) !== inside(x, y);
      if (edge && start < 0) start = x;
      else if (!edge && start >= 0) { out.push(start, y, x, y); start = -1; }
    }
  }
  // Vertical edges on the line x, tracked as open runs while scanning rows.
  const open = new Int32Array(w + 1).fill(-1);
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      const edge = y < h && inside(x - 1, y) !== inside(x, y);
      if (edge && open[x] < 0) open[x] = y;
      else if (!edge && open[x] >= 0) { out.push(x, open[x], x, y); open[x] = -1; }
    }
  }
  return Float32Array.from(out);
}

/** Mask from a node's alpha (raster tiles directly; other nodes via their rendered content). */
export function maskFromAlpha(doc: DocumentLike, id: NodeId): Mask {
  const m = createMask(doc.width, doc.height);
  const node = doc.getNode(id);
  if (!node) return m;
  if (node.type === 'raster') {
    const nx = Math.round(node.x), ny = Math.round(node.y);
    node.tiles.forEach((buf, tx, ty) => {
      const ox = tx * TILE + nx, oy = ty * TILE + ny;
      const x0 = Math.max(0, ox), x1 = Math.min(m.w, ox + TILE);
      const y0 = Math.max(0, oy), y1 = Math.min(m.h, oy + TILE);
      for (let y = y0; y < y1; y++) {
        let i = ((y - oy) * TILE + (x0 - ox)) * 4 + 3;
        for (let x = x0; x < x1; x++, i += 4) m.data[y * m.w + x] = buf[i];
      }
    });
    return m;
  }
  const s = renderContent(node, { x: 0, y: 0, w: doc.width, h: doc.height }, createCpuContext());
  for (let i = 0, j = 3; i < m.data.length; i++, j += 4) m.data[i] = s.data[j];
  return m;
}
