// A tiny, read-mostly hook for the Playwright smoke test and for debugging in the console:
//   window.__photochop.activeDoc()        -> the active DocumentLike (or null)
//   window.__photochop.activeTab()        -> the active DocTab (doc, compositor, autosave, view)
//   window.__photochop.samplePixel(x, y)  -> RGBA of the composite at a document point
//   window.__photochop.docToScreen(x, y)  -> client coordinates of a document point
//   window.__photochop.flush()            -> resolves when every autosave has written
// It is always installed (it exposes nothing that is not already reachable from the page).
import { samplePixel } from '@/engine';
import { flushAll } from './docs';
import { canvasRef } from './shortcuts';
import { activeTab, documents } from './state';

export function installTestHook(): void {
  const hook = {
    activeDoc: () => activeTab.peek()?.doc ?? null,
    activeTab: () => activeTab.peek(),
    tabs: () => documents.peek(),
    samplePixel: (x: number, y: number) => {
      const t = activeTab.peek();
      if (!t) return null;
      t.compositor.composite(t.doc);
      return samplePixel(t.compositor, t.doc, { x, y });
    },
    docToScreen: (x: number, y: number) => {
      const t = activeTab.peek();
      const el = canvasRef.current;
      if (!t || !el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + x * t.view.zoom + t.view.panX, y: r.top + y * t.view.zoom + t.view.panY };
    },
    flush: () => flushAll(),
  };
  (window as unknown as { __photochop: typeof hook }).__photochop = hook;
}
