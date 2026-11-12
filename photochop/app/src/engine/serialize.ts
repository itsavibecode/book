// Document <-> JSON + PNG blobs, shared by IndexedDB and the .photochop file.
// Blob keys: 'layer/<id>' = RGBA PNG of the raster's tiles.bounds() (lossless, own encoder);
// 'mask/<id>' = 8-bit greyscale PNG at document size (one byte per pixel = mask value);
// 'selection' = the same greyscale format for the selection mask;
// 'saved/<id>' = the same greyscale format for each saved selection (format 2).
import { APP_NAME, APP_VERSION } from '@/app/constants';
import type { DocumentLike, SerializedDocument, SerializedDocumentJson, SerializedNode } from './contract';
import type { AnyNode, Mask, NodeId, RasterNode, TileStore } from './types';
import { copyMatrix, Document } from './document';
import { createTileStore } from './tiles';
import { blobBytes, decodePng, pngBlob } from './png';
import { makeImageData } from './util';
import { encodeJobs } from './workers/encode';
import { encodeJob, type PngJob, type PngTile } from './workers/job';
import { maskBounds } from './selection';

/** Blob keys the caller already holds and does not need re-encoded (autosave reuse). */
export interface SerializeSkip {
  layers?: ReadonlySet<NodeId>;
  masks?: ReadonlySet<NodeId>;
  selection?: boolean;
  /** Saved selection ids whose 'saved/<id>' blob is already stored and unchanged. */
  saved?: ReadonlySet<string>;
}

export interface SerializedParts {
  json: SerializedDocumentJson;
  files: Record<string, Uint8Array>;
  /** Every blob key the document needs, including the skipped ones. */
  keys: string[];
}

/** Pixels waiting for PNG encoding (private copies, safe to transfer to a worker). */
export type EncodeJob = PngJob;

export interface PartsSnapshot { json: SerializedDocumentJson; jobs: EncodeJob[]; keys: string[] }

function maskJob(key: string, m: Mask): EncodeJob {
  return { key, pixels: m.data.slice(), w: m.w, h: m.h, channels: 1 };
}

/**
 * Synchronous: reads the whole document at one instant (JSON plus copies of every pixel buffer
 * that needs encoding), so the saved state is consistent even if encoding happens later.
 */
export function snapshotParts(doc: DocumentLike, skip: SerializeSkip = {}, copies?: ReadonlyMap<NodeId, LayerCopy>): PartsSnapshot {
  const jobs: EncodeJob[] = [];
  const keys: string[] = [];
  const ser = (n: AnyNode): SerializedNode => {
    const hasMask = !!n.mask;
    if (n.mask) {
      const k = `mask/${n.id}`;
      keys.push(k);
      if (!skip.masks?.has(n.id)) jobs.push(maskJob(k, n.mask));
    }
    switch (n.type) {
      case 'raster': {
        const { tiles: _t, mask: _m, ...rest } = n;
        const bounds = n.tiles.bounds();
        if (bounds) {
          const k = `layer/${n.id}`;
          keys.push(k);
          if (!skip.layers?.has(n.id)) {
            const pre = copies?.get(n.id);
            const tiles = pre && pre.store === n.tiles ? pre.tiles : copyTiles(n.tiles);
            jobs.push({ key: k, tiles, ox: bounds.x, oy: bounds.y, w: bounds.w, h: bounds.h, channels: 4 });
          }
        }
        return { ...rest, effects: [...n.effects], mask: hasMask, bounds };
      }
      case 'text': {
        const { mask: _m, ...rest } = n;
        return { ...rest, color: [...n.color], matrix: copyMatrix(n.matrix), effects: [...n.effects], mask: hasMask };
      }
      case 'shape': {
        const { mask: _m, ...rest } = n;
        return {
          ...rest, fill: n.fill ? [...n.fill] : null, stroke: n.stroke ? [...n.stroke] : null,
          matrix: copyMatrix(n.matrix), effects: [...n.effects], mask: hasMask,
        };
      }
      case 'group': {
        const { mask: _m, children, ...rest } = n;
        return { ...rest, effects: [...n.effects], mask: hasMask, children: children.map(ser) };
      }
    }
  };
  const root = ser(doc.root);
  if (doc.selection) {
    keys.push('selection');
    if (!skip.selection) jobs.push(maskJob('selection', doc.selection.mask));
  }
  const saved: Array<{ id: string; name: string }> = [];
  for (const s of doc.savedSelections) {
    const k = `saved/${s.id}`;
    keys.push(k);
    saved.push({ id: s.id, name: s.name });
    if (!skip.saved?.has(s.id)) jobs.push(maskJob(k, s.mask));
  }
  const json: SerializedDocumentJson = {
    app: APP_NAME, version: APP_VERSION, format: 2,
    id: doc.id, name: doc.name, width: doc.width, height: doc.height,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    activeId: doc.activeId, root, selectionBounds: doc.selection ? { ...doc.selection.bounds } : null,
    dpi: doc.dpi, guides: doc.guides.map((g) => ({ id: g.id, axis: g.axis, pos: g.pos })), savedSelections: saved,
  };
  return { json, jobs, keys };
}

/** Snapshot and encode on the calling thread. */
export function serializeParts(doc: DocumentLike, skip: SerializeSkip = {}): SerializedParts {
  const snap = snapshotParts(doc, skip);
  const files: Record<string, Uint8Array> = {};
  for (const j of snap.jobs) files[j.key] = encodeJob(j);
  return { json: snap.json, files, keys: snap.keys };
}

/** Tile copies of one raster taken ahead of the final snapshot. */
export interface LayerCopy { store: TileStore; tiles: PngTile[] }

function copyTiles(t: TileStore): PngTile[] {
  const out: PngTile[] = [];
  t.forEach((buf, tx, ty) => { out.push({ tx, ty, buf: buf.slice() }); });
  return out;
}

/** Tiles copied per slice of the incremental snapshot (about 4 MB). */
const COPY_SLICE = 16;
const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));

async function copyTilesSliced(t: TileStore): Promise<PngTile[]> {
  const refs: Array<{ tx: number; ty: number }> = [];
  t.forEach((_b, tx, ty) => { refs.push({ tx, ty }); });
  const out: PngTile[] = [];
  for (let i = 0; i < refs.length; i++) {
    if (i > 0 && i % COPY_SLICE === 0) await yieldTask();
    const buf = t.get(refs[i].tx, refs[i].ty);
    if (buf) out.push({ tx: refs[i].tx, ty: refs[i].ty, buf: buf.slice() });
  }
  return out;
}

/**
 * The same consistent snapshot as snapshotParts, but raster tiles are copied in slices across
 * tasks. A raster that changes while it is being copied is copied again; any tree change starts
 * over. The final step (JSON, masks, changed layers) runs synchronously once nothing is pending,
 * so the result is the document at that one instant.
 */
export async function snapshotPartsSliced(doc: DocumentLike, skip: SerializeSkip = {}): Promise<PartsSnapshot> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const changed = new Set<NodeId>();
    let restart = false;
    let selectionChanged = false;
    const unsub = doc.subscribe((ev) => {
      if (ev.kind === 'pixels' || ev.kind === 'node') changed.add(ev.nodeId);
      else if (ev.kind === 'selection') selectionChanged = true;
      else if (ev.kind === 'tree' || ev.kind === 'document') restart = true;
    });
    try {
      const copies = new Map<NodeId, LayerCopy>();
      const rasters: RasterNode[] = [];
      const walk = (ns: AnyNode[]) => ns.forEach((n) => {
        if (n.type === 'raster' && !skip.layers?.has(n.id)) rasters.push(n);
        if (n.type === 'group') walk(n.children);
      });
      walk(doc.root.children);
      for (const n of rasters) {
        const store = n.tiles;
        copies.set(n.id, { store, tiles: await copyTilesSliced(store) });
        if (restart) break;
      }
      if (restart) continue;
      // Layers that changed while copying are copied again inside the final synchronous step, and
      // anything the caller meant to skip that changed meanwhile is written after all.
      for (const id of changed) copies.delete(id);
      const without = (s: ReadonlySet<string> | undefined) => (s ? new Set([...s].filter((id) => !changed.has(id))) : s);
      const eff: SerializeSkip = {
        layers: without(skip.layers), masks: without(skip.masks), saved: skip.saved,
        selection: skip.selection && !selectionChanged,
      };
      return snapshotParts(doc, eff, copies);
    } finally {
      unsub();
    }
  }
  return snapshotParts(doc, skip);
}

/** Snapshot in slices, encode off the main thread (worker when available, main thread otherwise). */
export async function serializePartsAsync(doc: DocumentLike, skip: SerializeSkip = {}): Promise<SerializedParts> {
  const snap = await snapshotPartsSliced(doc, skip);
  const files = await encodeJobs(snap.jobs);
  return { json: snap.json, files, keys: snap.keys };
}

export async function serializeDocument(doc: DocumentLike): Promise<SerializedDocument> {
  const parts = await serializePartsAsync(doc);
  const blobs: Record<string, Blob> = {};
  for (const [k, v] of Object.entries(parts.files)) blobs[k] = pngBlob(v);
  return { json: parts.json, blobs };
}

type BlobSource = Record<string, Blob | Uint8Array>;

async function bytesOf(src: BlobSource, key: string): Promise<Uint8Array> {
  const v = src[key];
  if (!v) throw new Error(`The file is missing ${key}`);
  return v instanceof Uint8Array ? v : blobBytes(v);
}

async function decodeMask(src: BlobSource, key: string, w: number, h: number): Promise<Mask> {
  const png = decodePng(await bytesOf(src, key));
  if (png.w !== w || png.h !== h) throw new Error('A mask in this file has the wrong size');
  if (png.channels === 1) return { w, h, data: png.data };
  // Tolerate RGBA masks written by other tools: take the red channel.
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = png.data[i * 4];
  return { w, h, data };
}

/** Rebuilds a live document from JSON plus blobs (Blob or raw bytes). */
export async function deserializeParts(json: SerializedDocumentJson, src: BlobSource): Promise<DocumentLike> {
  // Format 1 = 0.1.0 (no dpi, guides, saved selections or matrices); format 2 = 0.2.0.
  if (json.format !== 1 && json.format !== 2) throw new Error('This file was made by a newer version of PhotoChop');
  const doc = new Document({
    id: json.id, name: json.name, width: json.width, height: json.height,
    createdAt: json.createdAt, updatedAt: json.updatedAt,
  });
  if (typeof json.dpi === 'number' && json.dpi > 0) doc.dpi = json.dpi;
  if (Array.isArray(json.guides)) doc.guides = json.guides.map((g) => ({ id: g.id, axis: g.axis, pos: g.pos }));
  const W = doc.width, H = doc.height;
  const de = async (s: SerializedNode): Promise<AnyNode> => {
    const mask = s.mask ? await decodeMask(src, `mask/${s.id}`, W, H) : null;
    switch (s.type) {
      case 'raster': {
        const { bounds, mask: _m, ...rest } = s as Extract<SerializedNode, { type: 'raster' }>;
        const tiles = createTileStore();
        if (bounds) {
          const png = decodePng(await bytesOf(src, `layer/${s.id}`));
          if (png.channels !== 4 || png.w !== bounds.w || png.h !== bounds.h) throw new Error('A layer in this file has the wrong size');
          tiles.write(makeImageData(png.w, png.h, new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length)), bounds.x, bounds.y);
          tiles.prune();
        }
        const node: RasterNode = { ...rest, type: 'raster', effects: [...(rest.effects ?? [])], mask, tiles };
        return node;
      }
      case 'text': {
        const t = s as Extract<SerializedNode, { type: 'text' }>;
        return { ...t, color: [...t.color], matrix: copyMatrix(t.matrix), effects: [...(t.effects ?? [])], mask };
      }
      case 'shape': {
        const t = s as Extract<SerializedNode, { type: 'shape' }>;
        return {
          ...t, fill: t.fill ? [...t.fill] : null, stroke: t.stroke ? [...t.stroke] : null,
          matrix: copyMatrix(t.matrix), effects: [...(t.effects ?? [])], mask,
        };
      }
      case 'group': {
        const g = s as Extract<SerializedNode, { type: 'group' }>;
        const children: AnyNode[] = [];
        for (const c of g.children) children.push(await de(c));
        return { ...g, effects: [...(g.effects ?? [])], mask, children };
      }
    }
  };
  const rootSer = json.root as Extract<SerializedNode, { type: 'group' }>;
  for (const c of rootSer.children) doc.root.children.push(await de(c));
  if (json.selectionBounds && src.selection) {
    const mask = await decodeMask(src, 'selection', W, H);
    const bounds = maskBounds(mask);
    if (bounds) doc.selection = { mask, bounds };
  }
  if (Array.isArray(json.savedSelections)) {
    for (const s of json.savedSelections) {
      const key = `saved/${s.id}`;
      if (!src[key]) continue;
      doc.savedSelections.push({ id: s.id, name: s.name, mask: await decodeMask(src, key, W, H) });
    }
  }
  if (json.activeId && doc.getNode(json.activeId)) {
    doc.activeId = json.activeId;
    doc.selectedIds = [json.activeId];
  }
  return doc;
}

export async function deserializeDocument(s: SerializedDocument): Promise<DocumentLike> {
  return deserializeParts(s.json, s.blobs);
}
