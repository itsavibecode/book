// View tools: Hand (pan), Zoom (click / Alt-click / drag a box), Eyedropper.
import { samplePixel, type Point } from '@/engine';
import { background, foreground, toast, toolOptions } from '@/app/state';
import { errorText } from '@/app/util';
import { pane, panBy, zoomStep, zoomTo } from '@/app/view';
import type { Tool } from './types';

let last: Point | null = null;

export const handTool: Tool = {
  id: 'hand',
  cursor: () => (last ? 'grabbing' : 'grab'),
  onDown(ctx, p) {
    last = p.screen;
    ctx.setCursor('grabbing');
  },
  onMove(ctx, p) {
    if (!last) return;
    panBy(ctx.tab, p.screen.x - last.x, p.screen.y - last.y);
    last = p.screen;
  },
  onUp(ctx) {
    last = null;
    ctx.setCursor(null);
  },
  onCancel() { last = null; },
};

let zoomStart: Point | null = null;
let zoomNow: Point | null = null;

export const zoomTool: Tool = {
  id: 'zoom',
  cursor: () => (toolOptions.peek().zoom.mode === 'out' ? 'zoom-out' : 'zoom-in'),
  onDown(_ctx, p) {
    zoomStart = p.screen;
    zoomNow = p.screen;
  },
  onMove(ctx, p) {
    if (!zoomStart) return;
    zoomNow = p.screen;
    ctx.redrawOverlay();
  },
  onUp(ctx, p) {
    if (!zoomStart) return;
    const s = zoomStart;
    zoomStart = null;
    zoomNow = null;
    const dx = Math.abs(p.screen.x - s.x), dy = Math.abs(p.screen.y - s.y);
    const outMode = toolOptions.peek().zoom.mode === 'out';
    if (dx < 6 && dy < 6) {
      zoomStep(ctx.tab, outMode !== p.alt ? -1 : 1, p.screen);
    } else {
      // Zoom so the dragged box fills the pane.
      const z = ctx.view.zoom * Math.min(pane.w / dx, pane.h / dy);
      const cx = (s.x + p.screen.x) / 2, cy = (s.y + p.screen.y) / 2;
      const docC = ctx.toDoc({ x: cx, y: cy });
      zoomTo(ctx.tab, z, { x: cx, y: cy });
      const v = ctx.tab.view;
      const sc = { x: docC.x * v.zoom + v.panX, y: docC.y * v.zoom + v.panY };
      panBy(ctx.tab, pane.w / 2 - sc.x, pane.h / 2 - sc.y);
    }
    ctx.redrawOverlay();
  },
  onCancel() { zoomStart = null; zoomNow = null; },
  renderOverlay(_ctx, g) {
    if (!zoomStart || !zoomNow) return;
    const x = Math.min(zoomStart.x, zoomNow.x), y = Math.min(zoomStart.y, zoomNow.y);
    const w = Math.abs(zoomNow.x - zoomStart.x), h = Math.abs(zoomNow.y - zoomStart.y);
    g.save();
    g.setLineDash([4, 4]);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.strokeRect(x + 0.5, y + 0.5, w, h);
    g.lineDashOffset = 4;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeRect(x + 0.5, y + 0.5, w, h);
    g.restore();
  },
};

export const eyedropperTool: Tool = {
  id: 'eyedropper',
  cursor: 'crosshair',
  onDown(ctx, p) { sample(ctx, p.doc, p.alt); },
  onMove(ctx, p) { sample(ctx, p.doc, p.alt); },
  onUp() {},
};

function sample(ctx: Parameters<Tool['onDown']>[0], at: Point, alt: boolean): void {
  try {
    const activeOnly = toolOptions.peek().eyedropper.sample === 'active';
    const c = samplePixel(ctx.compositor, ctx.doc, { x: Math.floor(at.x), y: Math.floor(at.y) }, activeOnly ? ctx.doc.activeId ?? undefined : undefined);
    if (!c) return;
    const opaque: typeof c = [c[0], c[1], c[2], 255];
    if (alt) background.value = opaque;
    else foreground.value = opaque;
  } catch (e) {
    toast(errorText(e), 'error');
  }
}

