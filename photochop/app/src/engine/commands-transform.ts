// Guides, layer transforms and document operations (0.2.0). commands.ts spreads
// `transformCommands` into the CommandFactory. Import-cycle rule: anything taken from commands.ts
// may only be used inside functions, never at module top level.
import type { Command, CommandFactory, DocumentLike } from './contract';
import type { AnyNode, Guide, Interpolation, Mat3, NodeId, RasterNode, WarpGrid } from './types';
import { newId } from './document';
import { createTileStore } from './tiles';
import { makeImageData } from './util';
import { mat3IsAffine } from './transform/mat3';
import { warpBuffer } from './transform/warp';
import { asDocument, mapNode, snapDoc, snapNode } from './transform/state';
import {
  flipDocument, perspectiveCrop, resizeCanvas, resizeImage, revealAll, rotateDocument, snapshotCommand, trimDocument,
} from './transform/docops';

// ----- guides -----

function guidesCommand(label: string, change: (list: Guide[]) => void, extra?: Partial<Command>): Command {
  let before: Guide[] | null = null;
  let after: Guide[] | null = null;
  const set = (d: DocumentLike, list: Guide[]) => {
    const g = asDocument(d).guides;
    g.splice(0, g.length, ...list.map((x) => ({ ...x })));
    d.emit({ kind: 'guides' });
  };
  return {
    label,
    do(d) {
      if (!after) {
        before = asDocument(d).guides.map((x) => ({ ...x }));
        after = before.map((x) => ({ ...x }));
        change(after);
      }
      set(d, after);
    },
    undo(d) {
      if (before) set(d, before);
    },
    ...extra,
  };
}

function addGuide(_doc: DocumentLike, axis: 'h' | 'v', pos: number): Command {
  const id = newId();
  return guidesCommand('Add guide', (l) => { l.push({ id, axis, pos }); });
}

class MoveGuideCommand implements Command {
  readonly label = 'Move guide';
  private before: number | null = null;
  constructor(readonly id: string, private pos: number) {}
  private set(d: DocumentLike, pos: number): void {
    const g = asDocument(d).guides.find((x) => x.id === this.id);
    if (!g) return;
    g.pos = pos;
    d.emit({ kind: 'guides' });
  }
  do(d: DocumentLike): void {
    const g = asDocument(d).guides.find((x) => x.id === this.id);
    if (!g) throw new Error('That guide no longer exists');
    if (this.before === null) this.before = g.pos;
    this.set(d, this.pos);
  }
  undo(d: DocumentLike): void {
    if (this.before !== null) this.set(d, this.before);
  }
  merge(next: Command): boolean {
    if (!(next instanceof MoveGuideCommand) || next.id !== this.id) return false;
    this.pos = next.pos;
    return true;
  }
}

function moveGuide(_doc: DocumentLike, id: string, pos: number): Command {
  return new MoveGuideCommand(id, pos);
}

function removeGuide(_doc: DocumentLike, id: string): Command {
  return guidesCommand('Remove guide', (l) => {
    const i = l.findIndex((g) => g.id === id);
    if (i >= 0) l.splice(i, 1);
  });
}

function clearGuides(_doc: DocumentLike): Command {
  return guidesCommand('Clear guides', (l) => { l.length = 0; });
}

function setDocumentDpi(_doc: DocumentLike, dpi: number): Command {
  let before = 72;
  const value = Math.max(1, Math.min(100000, dpi));
  return {
    label: 'Resolution',
    do(d) { before = d.dpi; d.dpi = value; d.emit({ kind: 'document' }); },
    undo(d) { d.dpi = before; d.emit({ kind: 'document' }); },
  };
}

// ----- layer transforms -----

/** The listed nodes plus every descendant of listed groups, without duplicates. */
function expand(doc: DocumentLike, ids: NodeId[]): AnyNode[] {
  const seen = new Set<NodeId>();
  const out: AnyNode[] = [];
  const add = (n: AnyNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    out.push(n);
    if (n.type === 'group') n.children.forEach(add);
  };
  for (const id of ids) {
    const n = doc.getNode(id);
    if (!n) throw new Error('That layer no longer exists');
    add(n);
  }
  return out;
}

function transformNodes(doc: DocumentLike, ids: NodeId[], m: Mat3, interpolation: Interpolation): Command {
  if (!mat3IsAffine(m) && expand(doc, ids).some((n) => n.type === 'text' || n.type === 'shape')) {
    throw new Error('Rasterise this layer first');
  }
  const label = ids.length > 1 ? 'Transform layers' : 'Transform';
  return snapshotCommand(label, (d) => {
    const nodes = expand(d, ids);
    const before = snapDoc(d, nodes);
    const after = { ...before, nodes: nodes.map((n) => mapNode(n, m, { interp: interpolation, outW: d.width, outH: d.height })) };
    return { before, after };
  });
}

function warpNode(doc: DocumentLike, id: NodeId, grid: WarpGrid, interpolation: Interpolation): Command {
  const node = doc.getNode(id);
  if (!node) throw new Error('That layer no longer exists');
  if (node.type !== 'raster') throw new Error('Warp works on pixel layers; rasterise this layer first');
  if (grid.points.length !== 16) throw new Error('A warp grid needs 16 points');
  // The undistorted grid spans the tight content box (doc.contentBounds), which the UI also uses.
  const srcRect = doc.contentBounds(id);
  return snapshotCommand('Warp', (d) => {
    const n = d.getNode(id) as RasterNode;
    const before = snapDoc(d, [n]);
    const ns = snapNode(n);
    const tiles = createTileStore();
    if (srcRect) {
      const nx = Math.round(n.x), ny = Math.round(n.y);
      const img = n.tiles.read({ x: srcRect.x - nx, y: srcRect.y - ny, w: srcRect.w, h: srcRect.h });
      const out = warpBuffer({ data: img.data, w: srcRect.w, h: srcRect.h, x: srcRect.x, y: srcRect.y, ch: 4 }, srcRect, grid, interpolation);
      if (out) {
        tiles.write(makeImageData(out.rect.w, out.rect.h, out.data), out.rect.x - nx, out.rect.y - ny);
        tiles.prune();
      }
      if (n.mask) {
        const mk = n.mask;
        const data = mk.data.slice();
        // The patch defines the mapping inside the node's bounds: clear that area, then lay the warped mask in.
        for (let y = Math.max(0, srcRect.y); y < Math.min(mk.h, srcRect.y + srcRect.h); y++) {
          const x0 = Math.max(0, srcRect.x), x1 = Math.min(mk.w, srcRect.x + srcRect.w);
          if (x1 > x0) data.fill(0, y * mk.w + x0, y * mk.w + x1);
        }
        const wm = warpBuffer({ data: mk.data, w: mk.w, h: mk.h, x: 0, y: 0, ch: 1 }, srcRect, grid, interpolation, { x: 0, y: 0, w: mk.w, h: mk.h });
        if (wm) {
          const r = wm.rect;
          for (let y = 0; y < r.h; y++) {
            for (let x = 0; x < r.w; x++) {
              const v = wm.data[y * r.w + x], k = (y + r.y) * mk.w + x + r.x;
              if (v > data[k]) data[k] = v;
            }
          }
        }
        ns.mask = { w: mk.w, h: mk.h, data };
      }
    } else {
      tiles.prune();
    }
    ns.tiles = srcRect ? tiles : n.tiles;
    return { before, after: { ...before, nodes: [ns] } };
  });
}

export const transformCommands: Pick<
  CommandFactory,
  | 'addGuide' | 'moveGuide' | 'removeGuide' | 'clearGuides' | 'transformNodes' | 'warpNode'
  | 'resizeCanvas' | 'resizeImage' | 'rotateDocument' | 'flipDocument' | 'perspectiveCrop'
  | 'trimDocument' | 'revealAll' | 'setDocumentDpi'
> = {
  addGuide,
  moveGuide,
  removeGuide,
  clearGuides,
  transformNodes,
  warpNode,
  resizeCanvas,
  resizeImage,
  rotateDocument,
  flipDocument,
  perspectiveCrop,
  trimDocument,
  revealAll,
  setDocumentDpi,
};
