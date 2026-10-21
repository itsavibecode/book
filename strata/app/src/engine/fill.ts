// Paint bucket and selection fill. Both write through the raster edit session.
import type { DocumentLike, RasterEditSession } from './contract';
import type { Point, RGBA, Rect } from './types';
import { makeImageData, rectIntersect } from './util';

function srcOver(d: Uint8ClampedArray, i: number, c: RGBA, a: number): void {
  if (a <= 0) return;
  const ba = d[i + 3] / 255;
  const ao = a + ba * (1 - a);
  const k = ba * (1 - a);
  d[i] = (c[0] * a + d[i] * k) / ao;
  d[i + 1] = (c[1] * a + d[i + 1] * k) / ao;
  d[i + 2] = (c[2] * a + d[i + 2] * k) / ao;
  d[i + 3] = ao * 255;
}

/** Writes a doc-space buffer back into the node through the session (marks tiles first). */
function writeBack(session: RasterEditSession, img: ImageData, docRect: Rect): void {
  const nx = Math.round(session.node.x), ny = Math.round(session.node.y);
  const nodeRect = { x: docRect.x - nx, y: docRect.y - ny, w: docRect.w, h: docRect.h };
  session.markRect(nodeRect);
  session.tiles.write(img, nodeRect.x, nodeRect.y);
  session.flush(docRect);
}

function readDoc(session: RasterEditSession, r: Rect): ImageData {
  const nx = Math.round(session.node.x), ny = Math.round(session.node.y);
  return session.tiles.read({ x: r.x - nx, y: r.y - ny, w: r.w, h: r.h });
}

export function floodFill(session: RasterEditSession, doc: DocumentLike, at: Point, color: RGBA, tolerance: number, contiguous: boolean): Rect | null {
  const W = doc.width, H = doc.height;
  const ax = Math.floor(at.x), ay = Math.floor(at.y);
  if (ax < 0 || ay < 0 || ax >= W || ay >= H) return null;
  const sel = doc.selection;
  if (sel && sel.mask.data[ay * W + ax] === 0) return null;
  const img = readDoc(session, { x: 0, y: 0, w: W, h: H });
  const d = img.data;
  const si = (ay * W + ax) * 4;
  const sr = d[si], sg = d[si + 1], sb = d[si + 2], sa = d[si + 3];
  const tol = Math.max(0, Math.min(255, tolerance));
  const match = (p: number): boolean => {
    const i = p * 4, a = d[i + 3];
    // Transparent pixels have meaningless RGB, so compare only alpha when either side is clear.
    if (sa === 0 || a === 0) return Math.abs(a - sa) <= tol;
    return Math.abs(d[i] - sr) <= tol && Math.abs(d[i + 1] - sg) <= tol && Math.abs(d[i + 2] - sb) <= tol && Math.abs(a - sa) <= tol;
  };
  const hit = new Uint8Array(W * H);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const note = (xl: number, xr: number, y: number) => {
    if (xl < x0) x0 = xl;
    if (xr > x1) x1 = xr;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  if (contiguous) {
    const stack: number[] = [ax, ay];
    while (stack.length) {
      const y = stack.pop() as number, x = stack.pop() as number;
      const row = y * W;
      if (hit[row + x] || !match(row + x)) continue;
      let xl = x, xr = x;
      while (xl > 0 && !hit[row + xl - 1] && match(row + xl - 1)) xl--;
      while (xr < W - 1 && !hit[row + xr + 1] && match(row + xr + 1)) xr++;
      hit.fill(1, row + xl, row + xr + 1);
      note(xl, xr, y);
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= H) continue;
        const nrow = ny * W;
        let inRun = false;
        for (let xx = xl; xx <= xr; xx++) {
          const ok = !hit[nrow + xx] && match(nrow + xx);
          if (ok && !inRun) { stack.push(xx, ny); inRun = true; } else if (!ok) inRun = false;
        }
      }
    }
  } else {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (match(p)) { hit[p] = 1; note(x, x, y); }
      }
    }
  }
  if (x1 < 0) return null;
  const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const out = new Uint8ClampedArray(rect.w * rect.h * 4);
  const ca = color[3] / 255;
  for (let y = 0; y < rect.h; y++) {
    const srcRow = ((y + rect.y) * W + rect.x) * 4;
    out.set(d.subarray(srcRow, srcRow + rect.w * 4), y * rect.w * 4);
    for (let x = 0; x < rect.w; x++) {
      const p = (y + rect.y) * W + x + rect.x;
      if (!hit[p]) continue;
      const wgt = sel ? sel.mask.data[p] / 255 : 1;
      srcOver(out, (y * rect.w + x) * 4, color, ca * wgt);
    }
  }
  writeBack(session, makeImageData(rect.w, rect.h, out), rect);
  return rect;
}

export function fillSelection(session: RasterEditSession, doc: DocumentLike, color: RGBA): Rect | null {
  const full = { x: 0, y: 0, w: doc.width, h: doc.height };
  const sel = doc.selection;
  const rect = sel ? rectIntersect(sel.bounds, full) : full;
  if (!rect) return null;
  const img = readDoc(session, rect);
  const d = img.data;
  const ca = color[3] / 255;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const wgt = sel ? sel.mask.data[(y + rect.y) * doc.width + x + rect.x] / 255 : 1;
      if (wgt > 0) srcOver(d, (y * rect.w + x) * 4, color, ca * wgt);
    }
  }
  writeBack(session, img, rect);
  return rect;
}
