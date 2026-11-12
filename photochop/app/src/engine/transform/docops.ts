// Whole-document operations: canvas size, image size, rotate, flip, perspective crop, trim and
// reveal all. Nothing flattens: every layer, mask, text and shape is carried through, and the
// selection, saved selections and guides follow.
import type { Command, DocumentLike } from '../contract';
import type { AnyNode, GroupNode, Interpolation, Mat3, Point, RasterNode, Rect } from '../types';
import { createRasterNode } from '../document';
import { compositeDocument, createCpuContext } from '../compositor/cpu';
import { makeImageData, rectUnion } from '../util';
import { mat3FromQuad, mat3Invert, mat3IsAffine, mat3MapRect, mat3Multiply, mat3Rotate, mat3Scale, mat3Translate } from './mat3';
import {
  allNodes, applyDoc, cropTiles, mapDocMasks, mapNode, mapSaved, mapSelection, shiftMask, snapDoc, snapNode, type DocSnap,
} from './state';

type Build = (d: DocumentLike) => { before: DocSnap; after: DocSnap };

/** One undo step that swaps a before and an after snapshot (built lazily on the first do). */
export function snapshotCommand(label: string, build: Build, pre?: Command): Command {
  let pair: { before: DocSnap; after: DocSnap } | null = null;
  return {
    label,
    do(d) {
      pre?.do(d);
      if (!pair) pair = build(d);
      applyDoc(d, pair.after);
    },
    undo(d) {
      if (pair) applyDoc(d, pair.before);
      pre?.undo(d);
    },
  };
}

function cloneSnap(s: DocSnap): DocSnap {
  return { ...s, saved: s.saved.slice(), guides: s.guides.map((g) => ({ ...g })), nodes: s.nodes.map((n) => ({ ...n })) };
}

/** Maps the whole document through m onto a w x h canvas. guides maps each guide (null drops it). */
function mapDocument(d: DocumentLike, m: Mat3, w: number, h: number, interp: Interpolation,
  guide: (g: { axis: 'h' | 'v'; pos: number }) => { axis: 'h' | 'v'; pos: number } | null, clip?: Rect | null): { before: DocSnap; after: DocSnap } {
  const nodes = allNodes(d);
  const before = snapDoc(d, nodes);
  const after = cloneSnap(before);
  after.w = Math.max(1, Math.round(w));
  after.h = Math.max(1, Math.round(h));
  after.nodes = nodes.map((n) => mapNode(n, m, { interp, outW: after.w, outH: after.h, clip }));
  mapDocMasks(before, after, m, interp);
  after.guides = before.guides.flatMap((g) => {
    const r = guide(g);
    return r ? [{ id: g.id, axis: r.axis, pos: r.pos }] : [];
  });
  return { before, after };
}

export function resizeCanvas(_doc: DocumentLike, width: number, height: number, offsetX: number, offsetY: number,
  opts: { deletePixels?: boolean } = {}): Command {
  const W = Math.max(1, Math.round(width)), H = Math.max(1, Math.round(height));
  const dx = Math.round(offsetX), dy = Math.round(offsetY);
  return snapshotCommand('Canvas size', (d) => {
    const nodes = allNodes(d);
    const before = snapDoc(d, nodes);
    const after = cloneSnap(before);
    after.w = W;
    after.h = H;
    const clip = { x: 0, y: 0, w: W, h: H };
    after.nodes = nodes.map((n) => {
      const ns = snapNode(n);
      if (n.type !== 'group') { ns.x = n.x + dx; ns.y = n.y + dy; }
      if (n.type === 'raster' && opts.deletePixels) ns.tiles = cropTiles(n.tiles, Math.round(ns.x), Math.round(ns.y), clip);
      if (n.mask) ns.mask = shiftMask(n.mask, dx, dy, W, H, true);
      return ns;
    });
    after.selection = mapSelection(before.selection, (m) => shiftMask(m, dx, dy, W, H, false));
    after.saved = mapSaved(before.saved, (m) => shiftMask(m, dx, dy, W, H, false));
    after.guides = before.guides.map((g) => ({ ...g, pos: g.pos + (g.axis === 'h' ? dy : dx) }));
    return { before, after };
  });
}

export function resizeImage(_doc: DocumentLike, width: number, height: number, interpolation: Interpolation): Command {
  return snapshotCommand('Image size', (d) => {
    const W = Math.max(1, Math.round(width)), H = Math.max(1, Math.round(height));
    const sx = W / d.width, sy = H / d.height;
    return mapDocument(d, mat3Scale(sx, sy), W, H, interpolation,
      (g) => ({ axis: g.axis, pos: g.pos * (g.axis === 'h' ? sy : sx) }));
  });
}

export function rotateDocument(_doc: DocumentLike, degrees: number, opts: { interpolation?: Interpolation; expand?: boolean } = {}): Command {
  const q = ((degrees % 360) + 360) % 360;
  const label = q === 180 ? 'Rotate canvas 180' : q === 90 ? 'Rotate canvas 90 clockwise' : q === 270 ? 'Rotate canvas 90 anticlockwise' : 'Rotate canvas';
  return snapshotCommand(label, (d) => {
    const W = d.width, H = d.height;
    if (q % 90 === 0) {
      // Exact: content maps pixel centre to pixel centre.
      const m = mat3Multiply(mat3Translate(q === 90 || q === 270 ? H / 2 : W / 2, q === 90 || q === 270 ? W / 2 : H / 2), mat3Multiply(mat3Rotate(q), mat3Translate(-W / 2, -H / 2)));
      const nw = q === 90 || q === 270 ? H : W, nh = q === 90 || q === 270 ? W : H;
      return mapDocument(d, m, nw, nh, 'nearest', (g) => {
        const p = g.axis === 'v' ? { x: g.pos, y: 0 } : { x: 0, y: g.pos };
        const t = { x: m[0] * p.x + m[1] * p.y + m[2], y: m[3] * p.x + m[4] * p.y + m[5] };
        const axis = q === 180 ? g.axis : g.axis === 'h' ? 'v' : 'h';
        return { axis, pos: axis === 'v' ? t.x : t.y };
      });
    }
    let nw = W, nh = H;
    if (opts.expand) {
      const b = mat3MapRect(mat3Rotate(q, W / 2, H / 2), { x: 0, y: 0, w: W, h: H }) as Rect;
      nw = Math.ceil(b.w - 1e-6);
      nh = Math.ceil(b.h - 1e-6);
    }
    const m = mat3Multiply(mat3Translate(nw / 2, nh / 2), mat3Multiply(mat3Rotate(q), mat3Translate(-W / 2, -H / 2)));
    const dx = (nw - W) / 2, dy = (nh - H) / 2;
    return mapDocument(d, m, nw, nh, opts.interpolation ?? 'bicubic', (g) => ({ axis: g.axis, pos: g.pos + (g.axis === 'h' ? dy : dx) }));
  });
}

export function flipDocument(_doc: DocumentLike, axis: 'h' | 'v'): Command {
  return snapshotCommand(axis === 'h' ? 'Flip canvas horizontal' : 'Flip canvas vertical', (d) => {
    const m = axis === 'h' ? mat3Scale(-1, 1, d.width / 2, 0) : mat3Scale(1, -1, 0, d.height / 2);
    return mapDocument(d, m, d.width, d.height, 'nearest', (g) => (
      g.axis === (axis === 'h' ? 'v' : 'h') ? { axis: g.axis, pos: (axis === 'h' ? d.width : d.height) - g.pos } : g));
  });
}

/** Swaps text and shape nodes (anywhere in the tree) for rasters with the same id; undo swaps back. */
function rasteriseVectors(): Command {
  let swaps: Array<{ parent: GroupNode; index: number; from: AnyNode; to: RasterNode }> | null = null;
  return {
    label: 'Rasterise',
    do(d) {
      if (!swaps) {
        swaps = [];
        const ctx = createCpuContext();
        const walk = (g: GroupNode) => g.children.forEach((c, index) => {
          if (c.type === 'group') { walk(c); return; }
          if (c.type !== 'text' && c.type !== 'shape') return;
          const r = createRasterNode(c.name);
          const to: RasterNode = { ...r, id: c.id, visible: c.visible, locked: c.locked, opacity: c.opacity, blend: c.blend, mask: c.mask, maskEnabled: c.maskEnabled, effects: [...c.effects] };
          const s = ctx.cache.surface(c);
          if (s) { to.tiles.write(makeImageData(s.w, s.h, s.data), s.x, s.y); to.tiles.prune(); }
          swaps!.push({ parent: g, index, from: c, to });
        });
        walk(d.root);
      }
      for (const s of swaps) s.parent.children[s.index] = s.to;
      if (swaps.length) d.emit({ kind: 'tree' });
    },
    undo(d) {
      if (!swaps) return;
      for (const s of swaps) s.parent.children[s.index] = s.from;
      if (swaps.length) d.emit({ kind: 'tree' });
    },
  };
}

export function perspectiveCrop(_doc: DocumentLike, corners: [Point, Point, Point, Point], outW: number, outH: number, interpolation: Interpolation): Command {
  const W = Math.max(1, Math.round(outW)), H = Math.max(1, Math.round(outH));
  const toQuad = mat3FromQuad({ x: 0, y: 0, w: W, h: H }, corners);
  const m = mat3Invert(toQuad);
  if (!m) throw new Error('Those corners do not make a usable crop');
  return snapshotCommand('Perspective crop', (d) => mapDocument(d, m, W, H, interpolation,
    // Guides survive only when the crop is affine (they stay straight lines along an axis).
    (g) => {
      if (!mat3IsAffine(m) || Math.abs(m[1]) > 1e-9 || Math.abs(m[3]) > 1e-9) return null;
      return { axis: g.axis, pos: g.axis === 'v' ? m[0] * g.pos + m[2] : m[4] * g.pos + m[5] };
    }, { x: 0, y: 0, w: W, h: H }), rasteriseVectors());
}

export function trimDocument(doc: DocumentLike, mode: 'transparent' | 'top-left' | 'bottom-right'): Command | null {
  const s = compositeDocument(doc);
  const W = s.w, H = s.h, p = s.data;
  const ref = mode === 'bottom-right' ? (W * H - 1) * 4 : 0;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const keep = mode === 'transparent' ? p[i + 3] !== 0
        : p[i] !== p[ref] || p[i + 1] !== p[ref + 1] || p[i + 2] !== p[ref + 2] || p[i + 3] !== p[ref + 3];
      if (!keep) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return null;
  if (x0 === 0 && y0 === 0 && x1 === W - 1 && y1 === H - 1) return null;
  const cmd = resizeCanvas(doc, x1 - x0 + 1, y1 - y0 + 1, -x0, -y0);
  return { ...cmd, label: 'Trim' };
}

export function revealAll(doc: DocumentLike): Command | null {
  let u: Rect | null = null;
  for (const n of doc.root.children) u = rectUnion(u, doc.contentBounds(n.id));
  if (!u) return null;
  const x0 = Math.min(0, Math.floor(u.x)), y0 = Math.min(0, Math.floor(u.y));
  const x1 = Math.max(doc.width, Math.ceil(u.x + u.w)), y1 = Math.max(doc.height, Math.ceil(u.y + u.h));
  if (x0 === 0 && y0 === 0 && x1 === doc.width && y1 === doc.height) return null;
  const cmd = resizeCanvas(doc, x1 - x0, y1 - y0, -x0, -y0);
  return { ...cmd, label: 'Reveal all' };
}