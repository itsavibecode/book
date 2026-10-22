// Commands that produce pixels: rasterise, merge down, flatten, clear.
import type { Command, DocumentLike } from './contract';
import { TILE, type AnyNode, type GroupNode, type NodeId, type RasterNode } from './types';
import { cloneMask, createRasterNode, newId, nodeDocBounds } from './document';
import { createTileStore } from './tiles';
import { beginRasterEdit } from './session';
import { requireNode, restoreActive, setActive, snapshotActive, type ActiveState } from './command-util';
import { blendIndex } from './compositor/blend';
import {
  blendSurface, compositeDocument, createCpuContext, drawNode, effectiveMask, renderContent, type Surface,
} from './compositor/cpu';
import { makeImageData, rectOuter, rectUnion } from './util';

/** Raster node that keeps the source node's layer props (name, visibility, opacity, blend, mask). */
function rasterLike(src: AnyNode, id: NodeId): RasterNode {
  const r = createRasterNode(src.name);
  return {
    ...r, id, name: src.name, visible: src.visible, locked: src.locked, opacity: src.opacity, blend: src.blend,
    mask: cloneMask(src.mask), maskEnabled: src.maskEnabled,
  };
}

function writeSurface(node: RasterNode, s: Surface): void {
  node.tiles.write(makeImageData(s.w, s.h, s.data), s.x - Math.round(node.x), s.y - Math.round(node.y));
  node.tiles.prune();
}

/** Swaps one child for another in place, remapping the active layer; undo puts the original back. */
function replaceCommand(label: string, id: NodeId, build: (d: DocumentLike, node: AnyNode) => AnyNode): Command {
  let original: AnyNode | null = null;
  let replacement: AnyNode | null = null;
  let act: ActiveState | null = null;
  return {
    label,
    do(d) {
      const node = requireNode(d, id);
      const parent = d.parentOf(id) as GroupNode;
      if (!replacement) replacement = build(d, node);
      original = node;
      act = snapshotActive(d);
      parent.children[parent.children.indexOf(node)] = replacement;
      d.emit({ kind: 'tree' });
      if (act.activeId === id || act.selectedIds.includes(id)) {
        d.activeId = act.activeId === id ? replacement.id : act.activeId;
        d.selectedIds = act.selectedIds.map((s) => (s === id ? (replacement as AnyNode).id : s));
        d.emit({ kind: 'active' });
      }
    },
    undo(d) {
      if (!original || !replacement) return;
      const parent = d.parentOf(replacement.id);
      if (parent) parent.children[parent.children.indexOf(replacement)] = original;
      d.emit({ kind: 'tree' });
      if (act) restoreActive(d, act);
    },
  };
}

export function rasterizeNode(doc: DocumentLike, id: NodeId): Command {
  const node = requireNode(doc, id);
  if (node.type === 'raster') throw new Error('This layer is already a pixel layer');
  return replaceCommand(node.type === 'text' ? 'Rasterise text' : 'Rasterise layer', id, (d, n) => {
    const out = rasterLike(n, newId());
    const ctx = createCpuContext();
    if (n.type === 'group') {
      const s = renderContent(n, { x: 0, y: 0, w: d.width, h: d.height }, ctx);
      writeSurface(out, s);
    } else if (n.type === 'text' || n.type === 'shape') {
      const s = ctx.cache.surface(n);
      if (s) writeSurface(out, s);
    }
    return out;
  });
}

export function mergeDown(doc: DocumentLike, id: NodeId): Command {
  const upper = requireNode(doc, id);
  const parent = doc.parentOf(id) as GroupNode;
  const idx = parent.children.indexOf(upper);
  const lower = parent.children[idx - 1];
  if (!lower) throw new Error('There is no layer below to merge into');
  if (lower.type === 'group') throw new Error('Merge down needs a layer below, not a group');
  let merged: RasterNode | null = null;
  let act: ActiveState | null = null;
  const build = (): RasterNode => {
    const ctx = createCpuContext();
    const region = rectUnion(nodeDocBounds(lower), nodeDocBounds(upper));
    const out: RasterNode = lower.type === 'raster'
      ? { ...lower, tiles: createTileStore() }
      : { ...rasterLike(lower, lower.id), x: 0, y: 0 };
    if (!region) return out;
    const r = rectOuter(region);
    let dst: Surface;
    if (lower.type === 'raster') {
      const img = lower.tiles.read({ x: r.x - Math.round(lower.x), y: r.y - Math.round(lower.y), w: r.w, h: r.h });
      dst = { data: img.data, ...r };
    } else {
      dst = renderContent(lower, r, ctx);
    }
    if (upper.visible && upper.opacity > 0) {
      if (upper.type === 'group') {
        const s = renderContent(upper, r, ctx);
        blendSurface(dst, s, r, upper.opacity, effectiveMask(upper), blendIndex(upper.blend));
      } else {
        drawNode(upper, dst, r, ctx, 1, upper.opacity, effectiveMask(upper), blendIndex(upper.blend));
      }
    }
    writeSurface(out, dst);
    return out;
  };
  return {
    label: 'Merge down',
    do(d) {
      const p = d.parentOf(id) as GroupNode;
      const i = p.children.indexOf(upper);
      if (!merged) merged = build();
      act = snapshotActive(d);
      p.children.splice(i - 1, 2, merged);
      d.emit({ kind: 'tree' });
      setActive(d, merged.id);
    },
    undo(d) {
      if (!merged) return;
      const p = d.parentOf(merged.id) as GroupNode;
      p.children.splice(p.children.indexOf(merged), 1, lower, upper);
      d.emit({ kind: 'tree' });
      if (act) restoreActive(d, act);
    },
  };
}

export function flattenDocument(_doc: DocumentLike): Command {
  let bg: RasterNode | null = null;
  let old: AnyNode[] = [];
  let act: ActiveState | null = null;
  return {
    label: 'Flatten image',
    do(d) {
      if (!bg) {
        bg = createRasterNode('Background');
        writeSurface(bg, compositeDocument(d));
      }
      old = d.root.children.slice();
      act = snapshotActive(d);
      d.root.children.splice(0, d.root.children.length, bg);
      d.emit({ kind: 'tree' });
      setActive(d, bg.id);
    },
    undo(d) {
      d.root.children.splice(0, d.root.children.length, ...old);
      d.emit({ kind: 'tree' });
      if (act) restoreActive(d, act);
    },
  };
}

export function clearPixels(_doc: DocumentLike, id: NodeId): Command {
  let inner: Command | null = null;
  return {
    label: 'Clear',
    do(d) {
      if (inner) {
        inner.do(d);
        return;
      }
      const s = beginRasterEdit(d, id);
      const node = s.node;
      const sel = d.selection;
      const nx = Math.round(node.x), ny = Math.round(node.y);
      const keys = node.tiles.keys().map((k) => k.split(',').map(Number) as [number, number]);
      for (const [tx, ty] of keys) {
        if (!sel) {
          s.markTile(tx, ty).fill(0);
          continue;
        }
        const b = sel.bounds;
        const ox = tx * TILE + nx, oy = ty * TILE + ny;
        const x0 = Math.max(b.x, ox, 0), x1 = Math.min(b.x + b.w, ox + TILE, d.width);
        const y0 = Math.max(b.y, oy, 0), y1 = Math.min(b.y + b.h, oy + TILE, d.height);
        if (x1 <= x0 || y1 <= y0) continue;
        const buf = s.markTile(tx, ty);
        const m = sel.mask.data, mw = sel.mask.w;
        for (let y = y0; y < y1; y++) {
          let i = ((y - oy) * TILE + (x0 - ox)) * 4 + 3;
          for (let x = x0; x < x1; x++, i += 4) {
            const v = m[y * mw + x];
            if (v) buf[i] = (buf[i] * (255 - v)) / 255;
          }
        }
      }
      inner = s.commit('Clear');
    },
    undo(d) {
      inner?.undo(d);
    },
  };
}
