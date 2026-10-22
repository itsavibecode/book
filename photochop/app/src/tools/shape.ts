// Rectangle and ellipse shapes: drag to create an editable shape layer. The fill is the
// foreground colour (or none), the stroke comes from the context bar.
import { createShapeNode, type Point } from '@/engine';
import { addNodeHere } from '@/app/layerOps';
import { foreground, toast, toolOptions } from '@/app/state';
import { errorText } from '@/app/util';
import { cssOf } from '@/app/colour';
import { dragRect, roundRect } from './dragRect';
import type { Tool } from './types';

function makeShapeTool(kind: 'rect' | 'ellipse'): Tool {
  let start: Point | null = null;
  let now: Point | null = null;
  let constrain = false;
  let centre = false;
  const rectNow = () => (start && now ? dragRect(start, now, constrain, centre) : null);
  let counter = 0;

  return {
    id: kind === 'rect' ? 'shapeRect' : 'shapeEllipse',
    cursor: 'crosshair',
    onDown(_ctx, p) {
      if (p.button !== 0) return;
      start = p.doc;
      now = p.doc;
    },
    onMove(ctx, p) {
      if (!start) return;
      now = p.doc;
      constrain = p.shift;
      centre = p.alt;
      ctx.redrawOverlay();
    },
    onUp(ctx, p) {
      if (!start) return;
      now = p.doc;
      const r = rectNow();
      start = null;
      now = null;
      ctx.redrawOverlay();
      if (!r) return;
      const rr = roundRect(r);
      if (rr.w < 2 || rr.h < 2) return;
      const o = toolOptions.peek().shape;
      const fg = foreground.peek();
      try {
        counter++;
        const node = createShapeNode(kind === 'rect' ? 'Rectangle' : 'Ellipse', {
          shape: kind, x: rr.x, y: rr.y, w: rr.w, h: rr.h,
          radius: kind === 'rect' ? Math.min(o.radius, rr.w / 2, rr.h / 2) : 0,
          fill: o.fillOn ? [fg[0], fg[1], fg[2], fg[3]] : null,
          stroke: o.strokeOn ? [...o.strokeColor] as typeof o.strokeColor : null,
          strokeWidth: o.strokeWidth,
        });
        addNodeHere(ctx.tab, node);
      } catch (e) {
        toast(errorText(e), 'error');
      }
    },
    onCancel(ctx) { start = null; now = null; ctx.redrawOverlay(); },
    renderOverlay(ctx, g) {
      const r = rectNow();
      if (!r) return;
      const o = toolOptions.peek().shape;
      const a = ctx.toScreen({ x: r.x, y: r.y });
      const w = r.w * ctx.view.zoom, h = r.h * ctx.view.zoom;
      g.save();
      g.beginPath();
      if (kind === 'ellipse') g.ellipse(a.x + w / 2, a.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else {
        const rad = Math.min(o.radius * ctx.view.zoom, w / 2, h / 2);
        g.roundRect(a.x, a.y, w, h, rad);
      }
      if (o.fillOn) { g.fillStyle = cssOf(foreground.peek()); g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1; }
      if (o.strokeOn && o.strokeWidth > 0) { g.lineWidth = o.strokeWidth * ctx.view.zoom; g.strokeStyle = cssOf(o.strokeColor); g.stroke(); }
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(76,141,255,0.95)';
      g.stroke();
      g.restore();
    },
  };
}

export const shapeRectTool = makeShapeTool('rect');
export const shapeEllipseTool = makeShapeTool('ellipse');
