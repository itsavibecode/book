// Brush and Eraser: one raster edit session per stroke, fed with coalesced pointer events,
// committed as a single history step.
import {
  beginRasterEdit, createBrushStroke, type BrushStrokeLike, type RasterEditSession,
} from '@/engine';
import { foreground, toolOptions } from '@/app/state';
import { errorText } from '@/app/util';
import { toast } from '@/app/state';
import type { PaintOptions } from './options';
import { paintTarget } from './paintTarget';
import type { Tool, ToolContext } from './types';

function makePaintTool(mode: 'paint' | 'erase'): Tool {
  let session: RasterEditSession | null = null;
  let stroke: BrushStrokeLike | null = null;
  let hover: { x: number; y: number } | null = null;
  const label = mode === 'paint' ? 'Brush' : 'Eraser';
  const opts = (): PaintOptions => (mode === 'paint' ? toolOptions.peek().brush : toolOptions.peek().eraser);

  const finish = (ctx: ToolContext) => {
    if (!session || !stroke) return;
    try {
      const rect = stroke.end();
      if (rect) {
        session.flush(rect);
        ctx.doc.history.record(session.commit(label));
      } else {
        session.cancel();
      }
    } catch (e) {
      toast(errorText(e), 'error');
      try { session.cancel(); } catch { /* already dead */ }
    }
    session = null;
    stroke = null;
  };

  return {
    id: mode === 'paint' ? 'brush' : 'eraser',
    cursor: (ctx) => (opts().size * ctx.view.zoom >= 6 ? 'none' : 'crosshair'),
    onDown(ctx, p) {
      if (p.button !== 0) return;
      const node = paintTarget(ctx, mode === 'paint' ? 'Paint' : 'Erase');
      if (!node) return;
      const o = opts();
      try {
        session = beginRasterEdit(ctx.doc, node.id);
        stroke = createBrushStroke(session, {
          size: o.size, hardness: o.hardness / 100, opacity: o.opacity / 100, flow: o.flow / 100,
          spacing: Math.max(0.01, o.spacing / 100), color: foreground.peek(),
          pressureSize: o.pressureSize, pressureOpacity: o.pressureOpacity, mode,
        }, ctx.doc.selection);
        stroke.begin({ x: p.doc.x, y: p.doc.y, pressure: p.pressure });
        session.flush();
      } catch (e) {
        toast(errorText(e), 'error');
        session = null;
        stroke = null;
      }
    },
    onMove(ctx, p) {
      hover = p.doc;
      if (stroke && session) {
        for (const c of p.coalesced) stroke.move({ x: c.doc.x, y: c.doc.y, pressure: c.pressure });
        session.flush();
      }
      ctx.redrawOverlay();
    },
    onUp(ctx) {
      finish(ctx);
      ctx.redrawOverlay();
    },
    onCancel() {
      if (session) { try { session.cancel(); } catch { /* ignore */ } }
      session = null;
      stroke = null;
    },
    onHover(ctx, p) {
      hover = p ? p.doc : null;
      ctx.redrawOverlay();
    },
    renderOverlay(ctx, g) {
      if (!hover) return;
      const s = ctx.toScreen(hover);
      const r = Math.max(1, (opts().size * ctx.view.zoom) / 2);
      g.save();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.beginPath(); g.arc(s.x, s.y, r + 0.5, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.beginPath(); g.arc(s.x, s.y, Math.max(0.5, r - 0.5), 0, Math.PI * 2); g.stroke();
      if (r < 4) {
        g.beginPath();
        g.moveTo(s.x - 6, s.y); g.lineTo(s.x + 6, s.y); g.moveTo(s.x, s.y - 6); g.lineTo(s.x, s.y + 6);
        g.stroke();
      }
      g.restore();
    },
  };
}

export const brushTool = makePaintTool('paint');
export const eraserTool = makePaintTool('erase');
