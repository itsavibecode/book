// Paint bucket: one click = one flood fill on the active pixel layer, one history step.
import { beginRasterEdit, fillSelection, floodFill } from '@/engine';
import { activeTab, foreground, toast, toolOptions } from '@/app/state';
import { errorText } from '@/app/util';
import { paintTarget } from './paintTarget';
import type { Tool } from './types';

export const fillTool: Tool = {
  id: 'fill',
  cursor: 'crosshair',
  onDown(ctx, p) {
    if (p.button !== 0) return;
    const { x, y } = p.doc;
    if (x < 0 || y < 0 || x >= ctx.doc.width || y >= ctx.doc.height) return;
    const node = paintTarget(ctx, 'Fill');
    if (!node) return;
    const o = toolOptions.peek().fill;
    try {
      const session = beginRasterEdit(ctx.doc, node.id);
      const rect = floodFill(session, ctx.doc, { x: Math.floor(x), y: Math.floor(y) }, foreground.peek(), o.tolerance, o.contiguous);
      if (rect) {
        session.flush(rect);
        ctx.doc.history.record(session.commit('Fill'));
      } else {
        session.cancel();
      }
    } catch (e) {
      toast(errorText(e), 'error');
    }
  },
  onMove() {},
  onUp() {},
};

/** 'Fill selection' button in the context bar (whole layer when nothing is selected). */
export function fillSelectionNow(): void {
  const tab = activeTab.peek();
  if (!tab) return;
  const ctx = {
    tab, doc: tab.doc, compositor: tab.compositor, view: tab.view,
    redrawOverlay() {}, setCursor() {}, toScreen: (p: { x: number; y: number }) => p, toDoc: (p: { x: number; y: number }) => p,
  };
  const node = paintTarget(ctx, 'Fill');
  if (!node) return;
  try {
    const session = beginRasterEdit(tab.doc, node.id);
    const rect = fillSelection(session, tab.doc, foreground.peek());
    if (rect) {
      session.flush(rect);
      tab.doc.history.record(session.commit('Fill selection'));
    } else {
      session.cancel();
    }
  } catch (e) {
    toast(errorText(e), 'error');
  }
}
