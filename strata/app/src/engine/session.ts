// Raster edit sessions: capture each touched tile's before-state once, then produce one
// undoable command holding before/after tile patches.
import type { Command, DocumentLike, RasterEditSession } from './contract';
import { TILE, type NodeId, type RasterNode, type Rect, type TilePatch, type TileStore } from './types';
import { isTransparent } from './tiles';
import { rectUnion } from './util';

const key = (tx: number, ty: number) => `${tx},${ty}`;

function sameBytes(a: Uint8ClampedArray | undefined, b: Uint8ClampedArray | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function tilesRect(patches: Array<{ tx: number; ty: number }>, nx: number, ny: number): Rect | null {
  let r: Rect | null = null;
  for (const p of patches) r = rectUnion(r, { x: p.tx * TILE + nx, y: p.ty * TILE + ny, w: TILE, h: TILE });
  return r;
}

/** Undo/redo swap whole tiles. Buffers are copied on the way in so later in-place edits never reach a patch. */
export class TilePatchCommand implements Command {
  constructor(readonly label: string, readonly nodeId: NodeId, readonly patches: TilePatch[]) {}

  do(doc: DocumentLike): void {
    this.apply(doc, 'after');
  }

  undo(doc: DocumentLike): void {
    this.apply(doc, 'before');
  }

  private apply(doc: DocumentLike, which: 'before' | 'after'): void {
    const node = doc.getNode(this.nodeId);
    if (!node || node.type !== 'raster') return;
    for (const p of this.patches) {
      const b = p[which];
      node.tiles.set(p.tx, p.ty, b ? b.slice() : undefined);
    }
    const rect = tilesRect(this.patches, Math.round(node.x), Math.round(node.y));
    if (rect) doc.emit({ kind: 'pixels', nodeId: this.nodeId, rect });
  }
}

interface Marked { tx: number; ty: number; before: Uint8ClampedArray | undefined }

export class Session implements RasterEditSession {
  readonly tiles: TileStore;
  private marked = new Map<string, Marked>();
  private dead = false;

  constructor(private readonly doc: DocumentLike, readonly node: RasterNode) {
    this.tiles = node.tiles;
  }

  markTile(tx: number, ty: number): Uint8ClampedArray {
    const k = key(tx, ty);
    if (!this.marked.has(k)) {
      const cur = this.tiles.get(tx, ty);
      this.marked.set(k, { tx, ty, before: cur ? cur.slice() : undefined });
    }
    return this.tiles.getOrCreate(tx, ty);
  }

  /** The tile as it was before this session touched it. null = not marked yet; undefined = did not exist. */
  beforeOf(tx: number, ty: number): Uint8ClampedArray | undefined | null {
    const m = this.marked.get(key(tx, ty));
    return m ? m.before : null;
  }

  markRect(rect: Rect): Rect {
    const x0 = Math.floor(Math.min(rect.x, rect.x + rect.w));
    const y0 = Math.floor(Math.min(rect.y, rect.y + rect.h));
    const x1 = Math.ceil(Math.max(rect.x, rect.x + rect.w));
    const y1 = Math.ceil(Math.max(rect.y, rect.y + rect.h));
    if (x1 > x0 && y1 > y0) {
      for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y1 - 1) / TILE); ty++) {
        for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x1 - 1) / TILE); tx++) this.markTile(tx, ty);
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  dirtyBounds(): Rect | null {
    return tilesRect([...this.marked.values()], Math.round(this.node.x), Math.round(this.node.y));
  }

  flush(rect?: Rect): void {
    const r = rect ?? this.dirtyBounds();
    if (r) this.doc.emit({ kind: 'pixels', nodeId: this.node.id, rect: r });
  }

  commit(label: string): Command {
    if (this.dead) throw new Error('This edit session has already ended');
    this.dead = true;
    const patches: TilePatch[] = [];
    for (const m of this.marked.values()) {
      const cur = this.tiles.get(m.tx, m.ty);
      let after: Uint8ClampedArray | undefined;
      if (cur && isTransparent(cur)) this.tiles.set(m.tx, m.ty, undefined);
      else if (cur) after = cur.slice();
      if (sameBytes(m.before, after)) continue;
      patches.push({ nodeId: this.node.id, tx: m.tx, ty: m.ty, before: m.before, after });
    }
    const rect = this.dirtyBounds();
    this.marked.clear();
    if (rect) this.doc.emit({ kind: 'pixels', nodeId: this.node.id, rect });
    return new TilePatchCommand(label, this.node.id, patches);
  }

  cancel(): void {
    if (this.dead) return;
    this.dead = true;
    const rect = this.dirtyBounds();
    for (const m of this.marked.values()) this.tiles.set(m.tx, m.ty, m.before);
    this.marked.clear();
    if (rect) this.doc.emit({ kind: 'pixels', nodeId: this.node.id, rect });
  }
}

export function beginRasterEdit(doc: DocumentLike, nodeId: NodeId): RasterEditSession {
  const node = doc.getNode(nodeId);
  if (!node) throw new Error('That layer no longer exists');
  if (node.type !== 'raster') throw new Error('Only pixel layers can be painted on; rasterise the layer first');
  return new Session(doc, node);
}
