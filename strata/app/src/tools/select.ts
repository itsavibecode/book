// Rectangle and ellipse select. Drag a marquee; on release the mask is combined with the
// current selection per the mode (context bar, or Shift = add, Alt = subtract, both =
// intersect at the start of the drag). A click without a drag deselects.
import { ellipseMask, rectMask, type Point } from '@/engine';
import { combineSelection, deselect } from '@/app/layerOps';
import { toast, toolOptions } from '@/app/state';
import { errorText } from '@/app/util';
import { dragRect, roundRect, strokeMarquee } from './dragRect';
import type { SelectMode } from './options';
import type { Tool, ToolContext, ToolPointer } from './types';

function makeSelectTool(kind: 'rect' | 'ellipse'): Tool {
  let start: Point | null = null;
  let now: Point | null = null;
  let mode: SelectMode = 'replace';
  let modeFromShift = false;
  let constrain = false;
  let centre = false;

  const rectNow = () => (start && now ? dragRect(start, now, constrain, centre) : null);

  return {
    id: kind === 'rect' ? 'selectRect' : 'selectEllipse',
    cursor: 'crosshair',
    onDown(ctx, p) {
      if (p.button !== 0) return;
      start = p.doc;
      now = p.doc;
      const hasSel = !!ctx.doc.selection;
      mode = toolOptions.peek().select.mode;
      modeFromShift = false;
      if (hasSel && p.shift && p.alt) { mode = 'intersect'; modeFromShift = true; }
      else if (hasSel && p.shift) { mode = 'add'; modeFromShift = true; }
      else if (hasSel && p.alt) mode = 'subtract';
      constrain = false;
      centre = false;
    },
    onMove(ctx, p) {
      if (!start) return;
      now = p.doc;
      constrain = p.shift && !modeFromShift;
      centre = p.alt && mode !== 'subtract';
      ctx.redrawOverlay();
    },
    onUp(ctx: ToolContext, p: ToolPointer) {
      if (!start) return;
      const s = start;
      now = p.doc;
      const r = rectNow();
      start = null;
      now = null;
      ctx.redrawOverlay();
      if (!r) return;
      const screenW = r.w * ctx.view.zoom, screenH = r.h * ctx.view.zoom;
      if (screenW < 3 && screenH < 3) {
        if (mode === 'replace') deselect();
        void s;
        return;
      }
      const rr = roundRect(r);
      if (rr.w < 1 || rr.h < 1) return;
      try {
        const m = kind === 'rect' ? rectMask(ctx.doc.width, ctx.doc.height, rr) : ellipseMask(ctx.doc.width, ctx.doc.height, rr);
        combineSelection(ctx.tab, m, mode);
      } catch (e) {
        toast(errorText(e), 'error');
      }
    },
    onCancel(ctx) { start = null; now = null; ctx.redrawOverlay(); },
    onKey(_ctx, e) {
      if (e.key === 'Escape') { deselect(); return true; }
      return false;
    },
    renderOverlay(ctx, g) {
      const r = rectNow();
      if (!r) return;
      const a = ctx.toScreen({ x: r.x, y: r.y });
      strokeMarquee(g, { x: a.x, y: a.y, w: r.w * ctx.view.zoom, h: r.h * ctx.view.zoom }, kind === 'ellipse');
    },
  };
}

export const selectRectTool = makeSelectTool('rect');
export const selectEllipseTool = makeSelectTool('ellipse');
