// Saved selections, stroke selection and layer via cut / copy (0.2.0). commands.ts spreads
// `selectionCommands` into the CommandFactory. Import-cycle rule: nothing from commands.ts is used
// here at module top level (nothing from it is needed at all).
import type { Command, CommandFactory, DocumentLike } from './contract';
import type { GroupNode, Mask, NodeId, RGBA, RasterNode, Rect, SavedSelection } from './types';
import { createRasterNode, newId } from './document';
import { clearPixels } from './commands-raster';
import { beginRasterEdit } from './session';
import { requireNode, restoreActive, setActive, snapshotActive, type ActiveState } from './command-util';
import { makeImageData, rectIntersect } from './util';
import { maskBounds } from './selection';
import { borderMask, contractMask, expandMask } from './select/modify';
import { checkMask } from './select/common';

function savedList(d: DocumentLike): SavedSelection[] {
  return d.savedSelections as SavedSelection[];
}

function saveSelection(doc: DocumentLike, name: string): Command {
  const sel = doc.selection;
  if (!sel) throw new Error('There is no selection to save');
  checkMask(sel.mask, doc.width, doc.height, 'Selection');
  const label = (name ?? '').trim() || `Selection ${doc.savedSelections.length + 1}`;
  const saved: SavedSelection = { id: newId(), name: label, mask: { w: sel.mask.w, h: sel.mask.h, data: sel.mask.data.slice() } };
  return {
    label: 'Save selection',
    do(d) {
      savedList(d).push(saved);
      d.emit({ kind: 'selection' });
    },
    undo(d) {
      const list = savedList(d);
      const i = list.indexOf(saved);
      if (i >= 0) list.splice(i, 1);
      d.emit({ kind: 'selection' });
    },
  };
}

function findSaved(doc: DocumentLike, id: string): SavedSelection {
  const s = doc.savedSelections.find((x) => x.id === id);
  if (!s) throw new Error('That saved selection no longer exists');
  return s;
}

function deleteSavedSelection(doc: DocumentLike, id: string): Command {
  findSaved(doc, id);
  let removed: { entry: SavedSelection; index: number } | null = null;
  return {
    label: 'Delete saved selection',
    do(d) {
      const list = savedList(d);
      const index = list.findIndex((x) => x.id === id);
      if (index < 0) return;
      removed = { entry: list[index], index };
      list.splice(index, 1);
      d.emit({ kind: 'selection' });
    },
    undo(d) {
      if (!removed) return;
      const list = savedList(d);
      list.splice(Math.min(removed.index, list.length), 0, removed.entry);
      d.emit({ kind: 'selection' });
    },
  };
}

function renameSavedSelection(doc: DocumentLike, id: string, name: string): Command {
  findSaved(doc, id);
  const next = (name ?? '').trim();
  if (!next) throw new Error('A saved selection needs a name');
  let before: string | null = null;
  return {
    label: 'Rename saved selection',
    do(d) {
      const s = savedList(d).find((x) => x.id === id);
      if (!s) return;
      before = s.name;
      s.name = next;
      d.emit({ kind: 'selection' });
    },
    undo(d) {
      const s = savedList(d).find((x) => x.id === id);
      if (!s || before === null) return;
      s.name = before;
      d.emit({ kind: 'selection' });
    },
  };
}

function requireRaster(doc: DocumentLike, id: NodeId): RasterNode {
  const n = requireNode(doc, id);
  if (n.type !== 'raster') throw new Error('Rasterise this layer first');
  return n;
}

/** The band a stroke paints, as a document-sized mask. */
function strokeBand(sel: Mask, width: number, position: 'inside' | 'center' | 'outside'): Mask {
  if (position === 'center') return borderMask(sel, width);
  const out: Mask = { w: sel.w, h: sel.h, data: new Uint8Array(sel.data.length) };
  const o = out.data, s = sel.data;
  if (position === 'inside') {
    const c = contractMask(sel, width).data;
    for (let i = 0; i < o.length; i++) { const v = 255 - c[i]; o[i] = s[i] < v ? s[i] : v; }
  } else {
    const e = expandMask(sel, width).data;
    for (let i = 0; i < o.length; i++) { const v = 255 - s[i]; o[i] = e[i] < v ? e[i] : v; }
  }
  return out;
}

function strokeSelection(doc: DocumentLike, id: NodeId, color: RGBA, width: number, position: 'inside' | 'center' | 'outside'): Command {
  requireRaster(doc, id);
  if (!doc.selection) throw new Error('There is no selection to stroke');
  if (!(width > 0)) throw new Error('The stroke needs a width of at least 1 px');
  let inner: Command | null = null;
  return {
    label: 'Stroke selection',
    do(d) {
      if (inner) { inner.do(d); return; }
      const sel = d.selection;
      if (!sel) throw new Error('There is no selection to stroke');
      checkMask(sel.mask, d.width, d.height, 'Selection');
      const band = strokeBand(sel.mask, Math.min(250, width), position);
      const b = maskBounds(band);
      const s = beginRasterEdit(d, id);
      if (b) paintBand(s.node, band, b, color, s);
      inner = s.commit('Stroke selection');
    },
    undo(d) {
      inner?.undo(d);
    },
  };
}

function paintBand(node: RasterNode, band: Mask, r: Rect, color: RGBA, s: ReturnType<typeof beginRasterEdit>): void {
  const nx = Math.round(node.x), ny = Math.round(node.y);
  const nodeRect = { x: r.x - nx, y: r.y - ny, w: r.w, h: r.h };
  s.markRect(nodeRect);
  const img = s.tiles.read(nodeRect);
  const d = img.data, bd = band.data, W = band.w;
  const ca = color[3] / 255;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const v = bd[(y + r.y) * W + x + r.x];
      if (!v) continue;
      const a = (ca * v) / 255;
      const i = (y * r.w + x) * 4;
      const ba = d[i + 3] / 255;
      const k = ba * (1 - a), ao = a + k;
      if (ao <= 0) continue;
      d[i] = (color[0] * a + d[i] * k) / ao;
      d[i + 1] = (color[1] * a + d[i + 1] * k) / ao;
      d[i + 2] = (color[2] * a + d[i + 2] * k) / ao;
      d[i + 3] = ao * 255;
    }
  }
  s.tiles.write(img, nodeRect.x, nodeRect.y);
  s.flush(r);
}

/** The new layer's content: selected pixels (coverage multiplies alpha), or the whole layer without a selection. */
function extractLayer(doc: DocumentLike, src: RasterNode, name: string): RasterNode | null {
  const out = createRasterNode(name);
  const sel = doc.selection;
  if (!sel) {
    if (src.tiles.size === 0) return null;
    out.tiles = src.tiles.clone();
    out.tiles.prune();
    if (out.tiles.size === 0) return null;
    out.x = src.x;
    out.y = src.y;
    return out;
  }
  checkMask(sel.mask, doc.width, doc.height, 'Selection');
  const nb = src.tiles.bounds();
  const nx = Math.round(src.x), ny = Math.round(src.y);
  const r = nb ? rectIntersect(sel.bounds, { x: nb.x + nx, y: nb.y + ny, w: nb.w, h: nb.h }) : null;
  if (!r) return null;
  const img = src.tiles.read({ x: r.x - nx, y: r.y - ny, w: r.w, h: r.h });
  const d = img.data, md = sel.mask.data, W = sel.mask.w;
  let any = false;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const i = (y * r.w + x) * 4 + 3;
      const a = Math.round((d[i] * md[(y + r.y) * W + x + r.x]) / 255);
      d[i] = a;
      if (a) any = true;
      else { d[i - 3] = 0; d[i - 2] = 0; d[i - 1] = 0; }
    }
  }
  if (!any) return null;
  out.tiles.write(makeImageData(r.w, r.h, d), r.x, r.y);
  out.tiles.prune();
  return out;
}

function layerVia(doc: DocumentLike, id: NodeId, cut: boolean): Command {
  const label = cut ? 'Layer via cut' : 'Layer via copy';
  const src = requireRaster(doc, id);
  const layer = extractLayer(doc, src, label);
  if (!layer) throw new Error('Nothing selected on this layer');
  const clear = cut ? clearPixels(doc, id) : null;
  let act: ActiveState | null = null;
  return {
    label,
    do(d) {
      const node = requireNode(d, id);
      const parent = d.parentOf(id) as GroupNode;
      act = snapshotActive(d);
      clear?.do(d);
      parent.children.splice(parent.children.indexOf(node) + 1, 0, layer);
      d.emit({ kind: 'tree' });
      setActive(d, layer.id);
    },
    undo(d) {
      const parent = d.parentOf(layer.id);
      if (parent) parent.children.splice(parent.children.indexOf(layer), 1);
      d.emit({ kind: 'tree' });
      clear?.undo(d);
      if (act) restoreActive(d, act);
    },
  };
}

function layerViaCut(doc: DocumentLike, id: NodeId): Command {
  return layerVia(doc, id, true);
}

function layerViaCopy(doc: DocumentLike, id: NodeId): Command {
  return layerVia(doc, id, false);
}

export const selectionCommands: Pick<
  CommandFactory,
  'saveSelection' | 'deleteSavedSelection' | 'renameSavedSelection' | 'strokeSelection' | 'layerViaCut' | 'layerViaCopy'
> = {
  saveSelection,
  deleteSavedSelection,
  renameSavedSelection,
  strokeSelection,
  layerViaCut,
  layerViaCopy,
};
