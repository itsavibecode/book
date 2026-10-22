// Document <-> JSON + PNG blobs, shared by IndexedDB and the .photochop file.
// Blob keys: 'layer/<id>' = RGBA PNG of the raster's tiles.bounds() (lossless, own encoder);
// 'mask/<id>' = 8-bit greyscale PNG at document size (one byte per pixel = mask value);
// 'selection' = the same greyscale format for the selection mask.
import { APP_NAME, APP_VERSION } from '@/app/constants';
import type { DocumentLike, SerializedDocument, SerializedDocumentJson, SerializedNode } from './contract';
import type { AnyNode, Mask, NodeId, RasterNode } from './types';
import { Document } from './document';
import { createTileStore } from './tiles';
import { blobBytes, decodePng, encodePng, pngBlob } from './png';
import { makeImageData } from './util';
import { maskBounds } from './selection';

/** Blob keys the caller already holds and does not need re-encoded (autosave reuse). */
export interface SerializeSkip {
  layers?: ReadonlySet<NodeId>;
  masks?: ReadonlySet<NodeId>;
  selection?: boolean;
}

export interface SerializedParts {
  json: SerializedDocumentJson;
  files: Record<string, Uint8Array>;
  /** Every blob key the document needs, including the skipped ones. */
  keys: string[];
}

function encodeMask(m: Mask): Uint8Array {
  return encodePng(m.data, m.w, m.h, 1, 4);
}

/** Synchronous: the whole document is read at one instant, so the snapshot is consistent. */
export function serializeParts(doc: DocumentLike, skip: SerializeSkip = {}): SerializedParts {
  const files: Record<string, Uint8Array> = {};
  const keys: string[] = [];
  const ser = (n: AnyNode): SerializedNode => {
    const hasMask = !!n.mask;
    if (n.mask) {
      const k = `mask/${n.id}`;
      keys.push(k);
      if (!skip.masks?.has(n.id)) files[k] = encodeMask(n.mask);
    }
    switch (n.type) {
      case 'raster': {
        const { tiles: _t, mask: _m, ...rest } = n;
        const bounds = n.tiles.bounds();
        if (bounds) {
          const k = `layer/${n.id}`;
          keys.push(k);
          if (!skip.layers?.has(n.id)) {
            const img = n.tiles.read(bounds);
            files[k] = encodePng(img.data, bounds.w, bounds.h, 4, 4);
          }
        }
        return { ...rest, effects: [...n.effects], mask: hasMask, bounds };
      }
      case 'text': {
        const { mask: _m, ...rest } = n;
        return { ...rest, color: [...n.color], effects: [...n.effects], mask: hasMask };
      }
      case 'shape': {
        const { mask: _m, ...rest } = n;
        return {
          ...rest, fill: n.fill ? [...n.fill] : null, stroke: n.stroke ? [...n.stroke] : null,
          effects: [...n.effects], mask: hasMask,
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
    if (!skip.selection) files.selection = encodeMask(doc.selection.mask);
  }
  const json: SerializedDocumentJson = {
    app: APP_NAME, version: APP_VERSION, format: 1,
    id: doc.id, name: doc.name, width: doc.width, height: doc.height,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    activeId: doc.activeId, root, selectionBounds: doc.selection ? { ...doc.selection.bounds } : null,
  };
  return { json, files, keys };
}

export async function serializeDocument(doc: DocumentLike): Promise<SerializedDocument> {
  const parts = serializeParts(doc);
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
  if (json.format !== 1) throw new Error('This file was made by a newer version of PhotoChop');
  const doc = new Document({
    id: json.id, name: json.name, width: json.width, height: json.height,
    createdAt: json.createdAt, updatedAt: json.updatedAt,
  });
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
        return { ...t, color: [...t.color], effects: [...(t.effects ?? [])], mask };
      }
      case 'shape': {
        const t = s as Extract<SerializedNode, { type: 'shape' }>;
        return {
          ...t, fill: t.fill ? [...t.fill] : null, stroke: t.stroke ? [...t.stroke] : null,
          effects: [...(t.effects ?? [])], mask,
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
  if (json.activeId && doc.getNode(json.activeId)) {
    doc.activeId = json.activeId;
    doc.selectedIds = [json.activeId];
  }
  return doc;
}

export async function deserializeDocument(s: SerializedDocument): Promise<DocumentLike> {
  return deserializeParts(s.json, s.blobs);
}
