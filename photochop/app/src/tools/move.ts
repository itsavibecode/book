// Move tool: drag the active layer (or the topmost layer under the pointer with Auto-select),
// resize shapes and text with the handles, nudge with the arrow keys. Every drag is one undo
// step: setProps commands share a mergeKey so History folds them together.
import { commands as cmds, samplePixel, type AnyNode, type DocumentLike, type Point, type Rect } from '@/engine';
import { setActiveNode } from '@/app/docs';
import { activeNode } from '@/app/layerOps';
import { toast, toolOptions } from '@/app/state';
import { errorText } from '@/app/util';
import { editActiveText } from './text';
import type { Tool, ToolContext } from './types';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

let drag: null | {
  id: string; start: Point; orig: { x: number; y: number }; key: string; group: boolean; moved: boolean;
  handle: Handle | null; origRect: Rect; origSize: number; origWidth: number | null;
} = null;
let groupDelta: Point = { x: 0, y: 0 };
let dragCounter = 0;

function leafNodes(n: AnyNode): AnyNode[] {
  return n.type === 'group' ? n.children.flatMap(leafNodes) : [n];
}

/** Topmost visible leaf layer with a painted pixel (or shape/text box) under p. */
export function nodeAt(ctx: ToolContext, p: Point): AnyNode | null {
  const doc = ctx.doc;
  for (const r of doc.flatten()) {
    const n = r.node;
    if (n.type === 'group' || !n.visible) continue;
    // Skip layers inside hidden groups.
    let hidden = false;
    for (let g = doc.parentOf(n.id); g && g !== doc.root; g = doc.parentOf(g.id)) if (!g.visible) hidden = true;
    if (hidden) continue;
    const b = doc.nodeBounds(n.id);
    if (!b || p.x < b.x || p.y < b.y || p.x >= b.x + b.w || p.y >= b.y + b.h) continue;
    if (n.type !== 'raster') return n;
    try {
      const c = samplePixel(ctx.compositor, doc, { x: Math.floor(p.x), y: Math.floor(p.y) }, n.id);
      if (c && c[3] > 8) return n;
    } catch { return n; }
  }
  return null;
}

function handlePoints(b: Rect): Record<Handle, Point> {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.x + b.w, btm = b.y + b.h;
  return { nw: { x: b.x, y: b.y }, n: { x: cx, y: b.y }, ne: { x: r, y: b.y }, e: { x: r, y: cy }, se: { x: r, y: btm }, s: { x: cx, y: btm }, sw: { x: b.x, y: btm }, w: { x: b.x, y: cy } };
}

function handlesFor(n: AnyNode): Handle[] {
  if (n.type === 'shape') return HANDLES;
  if (n.type === 'text') return ['nw', 'ne', 'se', 'sw', 'e', 'w'];
  return [];
}

function handleAt(ctx: ToolContext, n: AnyNode, screen: Point): Handle | null {
  const b = ctx.doc.nodeBounds(n.id);
  if (!b) return null;
  const pts = handlePoints(b);
  for (const h of handlesFor(n)) {
    const s = ctx.toScreen(pts[h]);
    if (Math.abs(s.x - screen.x) <= 7 && Math.abs(s.y - screen.y) <= 7) return h;
  }
  return null;
}

function resizedRect(o: Rect, h: Handle, dx: number, dy: number, keepAspect: boolean): Rect {
  let { x, y, w, h: hh } = o;
  if (h.includes('w')) { x += dx; w -= dx; }
  if (h.includes('e')) w += dx;
  if (h.includes('n')) { y += dy; hh -= dy; }
  if (h.includes('s')) hh += dy;
  if (keepAspect && h.length === 2 && o.w > 0 && o.h > 0) {
    const s = Math.max(w / o.w, hh / o.h);
    const nw = o.w * s, nh = o.h * s;
    if (h.includes('w')) x = o.x + o.w - nw;
    if (h.includes('n')) y = o.y + o.h - nh;
    w = nw; hh = nh;
  }
  if (w < 0) { x += w; w = -w; }
  if (hh < 0) { y += hh; hh = -hh; }
  return { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(hh)) };
}

function push(doc: DocumentLike, id: string, patch: Partial<AnyNode>, key: string): void {
  try { doc.history.push(cmds.setProps(doc, id, patch, key)); } catch (e) { toast(errorText(e), 'error'); }
}

function nudge(ctx: ToolContext, dx: number, dy: number): void {
  const n = activeNode(ctx.tab);
  if (!n) return;
  if (n.locked) { toast('This layer is locked'); return; }
  if (n.type === 'group') {
    const leaves = leafNodes(n).filter((l) => !l.locked);
    try { ctx.doc.history.push(cmds.batch('Nudge', leaves.map((l) => cmds.setProps(ctx.doc, l.id, { x: l.x + dx, y: l.y + dy })))); } catch (e) { toast(errorText(e), 'error'); }
    return;
  }
  push(ctx.doc, n.id, { x: n.x + dx, y: n.y + dy }, `nudge:${n.id}`);
}

export const moveTool: Tool = {
  id: 'move',
  cursor: 'default',
  onDown(ctx, p) {
    if (p.button !== 0) return;
    let n = activeNode(ctx.tab);
    const handle = n ? handleAt(ctx, n, p.screen) : null;
    if (!handle && (toolOptions.peek().move.autoSelect || p.ctrl || !n)) {
      const hit = nodeAt(ctx, p.doc);
      if (hit) { setActiveNode(ctx.tab, hit.id); n = hit; }
    }
    if (!n) return;
    if (n.locked) { toast('This layer is locked; unlock it in the Layers panel to move it'); return; }
    const b = ctx.doc.nodeBounds(n.id) ?? { x: n.x, y: n.y, w: 0, h: 0 };
    dragCounter++;
    drag = {
      id: n.id, start: p.doc, orig: { x: n.x, y: n.y }, key: `move:${dragCounter}`, group: n.type === 'group', moved: false,
      handle, origRect: n.type === 'shape' ? { x: n.x, y: n.y, w: n.w, h: n.h } : b,
      origSize: n.type === 'text' ? n.size : 0, origWidth: n.type === 'text' ? n.width : null,
    };
    groupDelta = { x: 0, y: 0 };
  },
  onMove(ctx, p) {
    if (!drag) return;
    const n = ctx.doc.getNode(drag.id);
    if (!n) { drag = null; return; }
    const dx = Math.round(p.doc.x - drag.start.x), dy = Math.round(p.doc.y - drag.start.y);
    if (!drag.moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    drag.moved = true;
    if (drag.handle && n.type === 'shape') {
      const r = resizedRect(drag.origRect, drag.handle, dx, dy, p.shift);
      push(ctx.doc, n.id, { x: r.x, y: r.y, w: r.w, h: r.h }, drag.key);
    } else if (drag.handle && n.type === 'text') {
      const r = resizedRect(drag.origRect, drag.handle, dx, dy, true);
      if (drag.handle === 'e' || drag.handle === 'w') {
        const w = Math.max(8, Math.round((drag.origWidth ?? drag.origRect.w) + (drag.handle === 'e' ? dx : -dx)));
        push(ctx.doc, n.id, { width: w, x: drag.handle === 'w' ? drag.orig.x + dx : drag.orig.x }, drag.key);
      } else if (drag.origRect.w > 0) {
        const scale = r.w / drag.origRect.w;
        const size = Math.max(1, Math.round(drag.origSize * scale));
        push(ctx.doc, n.id, { size, x: drag.orig.x + (r.x - drag.origRect.x), y: drag.orig.y + (r.y - drag.origRect.y) }, drag.key);
      }
    } else if (drag.group) {
      groupDelta = { x: dx, y: dy };
      ctx.redrawOverlay();
    } else {
      push(ctx.doc, n.id, { x: drag.orig.x + dx, y: drag.orig.y + dy }, drag.key);
    }
  },
  onUp(ctx) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.group && (groupDelta.x || groupDelta.y)) {
      const g = ctx.doc.getNode(d.id);
      if (g) {
        const leaves = leafNodes(g).filter((l) => !l.locked);
        try {
          ctx.doc.history.push(cmds.batch('Move', leaves.map((l) => cmds.setProps(ctx.doc, l.id, { x: l.x + groupDelta.x, y: l.y + groupDelta.y }))));
        } catch (e) { toast(errorText(e), 'error'); }
      }
    }
    groupDelta = { x: 0, y: 0 };
    ctx.redrawOverlay();
  },
  onCancel(ctx) { drag = null; groupDelta = { x: 0, y: 0 }; ctx.redrawOverlay(); },
  onDoubleClick(ctx, p) {
    const hit = nodeAt(ctx, p.doc);
    if (hit && hit.type === 'text') { setActiveNode(ctx.tab, hit.id); editActiveText(); }
  },
  onHover(ctx, p) {
    const n = activeNode(ctx.tab);
    const h = p && n ? handleAt(ctx, n, p.screen) : null;
    const cursors: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
    ctx.setCursor(h ? cursors[h] : null);
  },
  onKey(ctx, e) {
    const step = e.shiftKey ? 10 : 1;
    const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = map[e.key];
    if (d && !e.ctrlKey && !e.metaKey && !e.altKey) { nudge(ctx, d[0], d[1]); return true; }
    if (e.key === 'Enter' && editActiveText()) return true;
    return false;
  },
  renderOverlay(ctx, g) {
    const n = activeNode(ctx.tab);
    if (!n || !n.visible) return;
    let b = ctx.doc.nodeBounds(n.id);
    if (!b) return;
    if (drag?.group) b = { ...b, x: b.x + groupDelta.x, y: b.y + groupDelta.y };
    const a = ctx.toScreen({ x: b.x, y: b.y });
    const w = b.w * ctx.view.zoom, h = b.h * ctx.view.zoom;
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = '#4c8dff';
    g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(w), Math.round(h));
    const pts = handlePoints(b);
    for (const hd of handlesFor(n)) {
      const s = ctx.toScreen(pts[hd]);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 9, 9);
      g.strokeStyle = '#4c8dff';
      g.lineWidth = 1.5;
      g.strokeRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 9, 9);
    }
    g.restore();
  },
};

/** Align the active layer to the document edges or centre. */
export function alignActive(ctx: { doc: DocumentLike; id: string }, how: 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom'): void {
  const { doc, id } = ctx;
  const n = doc.getNode(id);
  const b = doc.nodeBounds(id);
  if (!n || !b) return;
  if (n.locked) { toast('This layer is locked'); return; }
  let dx = 0, dy = 0;
  if (how === 'left') dx = -b.x;
  if (how === 'hcenter') dx = Math.round((doc.width - b.w) / 2 - b.x);
  if (how === 'right') dx = doc.width - (b.x + b.w);
  if (how === 'top') dy = -b.y;
  if (how === 'vmiddle') dy = Math.round((doc.height - b.h) / 2 - b.y);
  if (how === 'bottom') dy = doc.height - (b.y + b.h);
  if (!dx && !dy) return;
  try {
    if (n.type === 'group') {
      const leaves = leafNodes(n).filter((l) => !l.locked);
      doc.history.push(cmds.batch('Align', leaves.map((l) => cmds.setProps(doc, l.id, { x: l.x + dx, y: l.y + dy }))));
    } else {
      doc.history.push(cmds.setProps(doc, id, { x: n.x + dx, y: n.y + dy }));
    }
  } catch (e) { toast(errorText(e), 'error'); }
}
