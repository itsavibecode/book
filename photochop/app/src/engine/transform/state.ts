// Snapshots for transform and document commands. Every command captures the fields it changes
// (tile store object, offsets, text/shape matrix, mask object, document size, selection, saved
// selections, guides) before and after, and undo/redo swap whole objects, so both are exact.
import type { DocumentLike } from '../contract';
import { Document } from '../document';
import { TILE, type AnyNode, type Guide, type Interpolation, type Mask, type Mat3, type Rect, type SavedSelection, type Selection, type TileStore } from '../types';
import { createTileStore } from '../tiles';
import { selectionFromMask } from '../selection';
import { mat3IsAffine } from './mat3';
import { resampleMask, resampleNodeTiles, resampleTiles } from './resample';

type Lin = [number, number, number, number];

export interface NodeSnap {
  node: AnyNode;
  x: number;
  y: number;
  mask: Mask | null;
  tiles?: TileStore;
  matrix?: Lin;
}

export interface DocSnap {
  w: number;
  h: number;
  selection: Selection | null;
  saved: SavedSelection[];
  guides: Guide[];
  nodes: NodeSnap[];
}

export function asDocument(doc: DocumentLike): Document {
  if (!(doc instanceof Document)) throw new Error('This document cannot be transformed');
  return doc;
}

export function snapNode(n: AnyNode): NodeSnap {
  const s: NodeSnap = { node: n, x: n.x, y: n.y, mask: n.mask };
  if (n.type === 'raster') s.tiles = n.tiles;
  if (n.type === 'text' || n.type === 'shape') s.matrix = [...n.matrix] as Lin;
  return s;
}

/** Every node in the tree (groups included), depth first. */
export function allNodes(doc: DocumentLike): AnyNode[] {
  const out: AnyNode[] = [];
  const walk = (ns: AnyNode[]) => {
    for (const n of ns) {
      out.push(n);
      if (n.type === 'group') walk(n.children);
    }
  };
  walk(doc.root.children);
  return out;
}

export function snapDoc(doc: DocumentLike, nodes: AnyNode[]): DocSnap {
  const d = asDocument(doc);
  return {
    w: d.width, h: d.height, selection: d.selection,
    saved: d.savedSelections.slice(), guides: d.guides.map((g) => ({ ...g })), nodes: nodes.map(snapNode),
  };
}

function nodePixelsRect(n: AnyNode): Rect | null {
  if (n.type !== 'raster') return null;
  const b = n.tiles.bounds();
  return b ? { x: b.x + Math.round(n.x), y: b.y + Math.round(n.y), w: b.w, h: b.h } : null;
}

/** Applies a snapshot and emits what changed. */
export function applyDoc(doc: DocumentLike, s: DocSnap): void {
  const d = asDocument(doc);
  const resized = d.width !== s.w || d.height !== s.h;
  if (resized) d._setSize(s.w, s.h);
  const selChanged = d.selection !== s.selection;
  d.selection = s.selection;
  const savedChanged = d.savedSelections.length !== s.saved.length || d.savedSelections.some((v, i) => v !== s.saved[i]);
  d.savedSelections.splice(0, d.savedSelections.length, ...s.saved);
  const guidesChanged = JSON.stringify(d.guides) !== JSON.stringify(s.guides);
  d.guides.splice(0, d.guides.length, ...s.guides.map((g) => ({ ...g })));
  for (const ns of s.nodes) {
    const n = ns.node;
    const before = nodePixelsRect(n);
    n.x = ns.x;
    n.y = ns.y;
    n.mask = ns.mask;
    if (n.type === 'raster' && ns.tiles) n.tiles = ns.tiles;
    if ((n.type === 'text' || n.type === 'shape') && ns.matrix) n.matrix = [...ns.matrix] as Lin;
  }
  if (resized || savedChanged) d.emit({ kind: 'document' });
  for (const ns of s.nodes) {
    d.emit({ kind: 'node', nodeId: ns.node.id });
    const r = nodePixelsRect(ns.node);
    if (r) d.emit({ kind: 'pixels', nodeId: ns.node.id, rect: r });
  }
  if (selChanged) d.emit({ kind: 'selection' });
  if (guidesChanged) d.emit({ kind: 'guides' });
}

// ----- mapping helpers -----

const snapNum = (v: number, eps: number) => (Math.abs(v - Math.round(v)) < eps ? Math.round(v) : v);

/** Composes affine m (document space) into a text/shape node's matrix and offset. */
export function composeLinear(ns: NodeSnap, m: Mat3): void {
  const [a, b, c, d] = ns.matrix as Lin;
  const na = m[0] * a + m[1] * b, nb = m[3] * a + m[4] * b;
  const nc = m[0] * c + m[1] * d, nd = m[3] * c + m[4] * d;
  ns.matrix = [snapNum(na, 1e-12), snapNum(nb, 1e-12), snapNum(nc, 1e-12), snapNum(nd, 1e-12)];
  const x = m[0] * ns.x + m[1] * ns.y + m[2], y = m[3] * ns.x + m[4] * ns.y + m[5];
  ns.x = snapNum(x, 1e-9);
  ns.y = snapNum(y, 1e-9);
}

/** Integer translation of a mask onto a new size; exposed area copies the nearest edge value when clampEdges. */
export function shiftMask(m: Mask, dx: number, dy: number, w: number, h: number, clampEdges: boolean): Mask {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let sy = y - dy;
    if (sy < 0 || sy >= m.h) {
      if (!clampEdges) continue;
      sy = sy < 0 ? 0 : m.h - 1;
    }
    const row = y * w, srow = sy * m.w;
    for (let x = 0; x < w; x++) {
      let sx = x - dx;
      if (sx < 0 || sx >= m.w) {
        if (!clampEdges) continue;
        sx = sx < 0 ? 0 : m.w - 1;
      }
      out[row + x] = m.data[srow + sx];
    }
  }
  return { w, h, data: out };
}

export function mapSelection(sel: Selection | null, f: (m: Mask) => Mask): Selection | null {
  return sel ? selectionFromMask(f(sel.mask)) : null;
}

/** Raster tiles cropped to a document-space rect (exact copy, no resampling). */
export function cropTiles(tiles: TileStore, nx: number, ny: number, clip: Rect): TileStore {
  const c = { x: clip.x - nx, y: clip.y - ny, w: clip.w, h: clip.h };
  // Fast path: tiles fully inside are shared copies; edge tiles go through the exact resampler.
  const out = createTileStore();
  const edge = createTileStore();
  tiles.forEach((buf, tx, ty) => {
    const x = tx * TILE, y = ty * TILE;
    if (x >= c.x && y >= c.y && x + TILE <= c.x + c.w && y + TILE <= c.y + c.h) out.set(tx, ty, buf.slice());
    else if (x < c.x + c.w && y < c.y + c.h && x + TILE > c.x && y + TILE > c.y) edge.set(tx, ty, buf);
  });
  if (edge.size) {
    const part = resampleTiles(edge, [1, 0, 0, 0, 1, 0, 0, 0, 1], 'nearest', c);
    part.forEach((buf, tx, ty) => out.set(tx, ty, buf));
  }
  return out;
}

export interface MapOptions {
  interp: Interpolation;
  outW: number;
  outH: number;
  /** Document-space clip for raster output (null keeps everything). */
  clip?: Rect | null;
}

/** After-state of one node under document matrix m. Text/shape must already be known affine-safe. */
export function mapNode(n: AnyNode, m: Mat3, o: MapOptions): NodeSnap {
  const ns = snapNode(n);
  if (n.type === 'raster') {
    ns.tiles = resampleNodeTiles(n.tiles, Math.round(n.x), Math.round(n.y), m, o.interp, o.clip ?? undefined);
  } else if (n.type === 'text' || n.type === 'shape') {
    if (!mat3IsAffine(m)) throw new Error('Rasterise this layer first');
    composeLinear(ns, m);
  }
  if (n.mask) ns.mask = resampleMask(n.mask, m, o.outW, o.outH, o.interp);
  return ns;
}

/** Saved selections mapped through f (new objects, same ids and names). */
export function mapSaved(list: SavedSelection[], f: (m: Mask) => Mask): SavedSelection[] {
  return list.map((s) => ({ id: s.id, name: s.name, mask: f(s.mask) }));
}

/** Selection and saved selections resampled through m onto outW x outH. */
export function mapDocMasks(before: DocSnap, after: DocSnap, m: Mat3, interp: Interpolation): void {
  const f = (mask: Mask) => resampleMask(mask, m, after.w, after.h, interp);
  after.selection = mapSelection(before.selection, f);
  after.saved = mapSaved(before.saved, f);
}
