// View transform helpers: fit, zoom around a point, clamped pan. The viewport registers its
// size and the insets covered by floating chrome (rail, dock, sheet) so Fit centres the
// document in the visible area.
import { activeTab, compact, setView, type DocTab, type View } from './state';
import { clamp } from './util';

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 64;
const STEPS = [0.01, 0.02, 0.03, 0.05, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 5, 6, 8, 12, 16, 24, 32, 48, 64];

export const pane = { w: 800, h: 600 };

export function setPaneSize(w: number, h: number): void {
  pane.w = Math.max(1, w);
  pane.h = Math.max(1, h);
}

function insets() {
  // left rail on desktop; dock + sheet + context pill on compact
  return compact.peek() ? { l: 12, r: 12, t: 12, b: 200 } : { l: 72, r: 24, t: 24, b: 56 };
}

export function fitView(tab: DocTab): View {
  const i = insets();
  const aw = Math.max(40, pane.w - i.l - i.r);
  const ah = Math.max(40, pane.h - i.t - i.b);
  const zoom = clamp(Math.min(aw / tab.doc.width, ah / tab.doc.height), MIN_ZOOM, MAX_ZOOM);
  return {
    zoom,
    panX: Math.round(i.l + (aw - tab.doc.width * zoom) / 2),
    panY: Math.round(i.t + (ah - tab.doc.height * zoom) / 2),
  };
}

export function fit(tab: DocTab | null = activeTab.peek()): void {
  if (!tab) return;
  tab.autoFit = true;
  setView(tab, fitView(tab));
}

/** Keeps at least 64 px of the document on screen. */
export function clampPan(tab: DocTab, v: View): View {
  const w = tab.doc.width * v.zoom, h = tab.doc.height * v.zoom, keep = 64;
  return {
    zoom: v.zoom,
    panX: clamp(v.panX, keep - w, pane.w - keep),
    panY: clamp(v.panY, keep - h, pane.h - keep),
  };
}

/** Sets zoom keeping the document point under screen point `at` fixed (default: pane centre). */
export function zoomTo(tab: DocTab, zoom: number, at?: { x: number; y: number }): void {
  const v = tab.view;
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const p = at ?? { x: pane.w / 2, y: pane.h / 2 };
  tab.autoFit = false;
  const dx = (p.x - v.panX) / v.zoom, dy = (p.y - v.panY) / v.zoom;
  setView(tab, clampPan(tab, { zoom: z, panX: p.x - dx * z, panY: p.y - dy * z }));
}

export function zoomStep(tab: DocTab | null, dir: 1 | -1, at?: { x: number; y: number }): void {
  if (!tab) return;
  const z = tab.view.zoom;
  const next = dir > 0 ? STEPS.find((s) => s > z * 1.001) ?? MAX_ZOOM : [...STEPS].reverse().find((s) => s < z * 0.999) ?? MIN_ZOOM;
  zoomTo(tab, next, at);
}

export function zoom100(tab: DocTab | null = activeTab.peek()): void {
  if (!tab) return;
  zoomTo(tab, 1);
}

export function panBy(tab: DocTab, dx: number, dy: number): void {
  const v = tab.view;
  tab.autoFit = false;
  setView(tab, clampPan(tab, { zoom: v.zoom, panX: v.panX + dx, panY: v.panY + dy }));
}

export function zoomLabel(z: number): string {
  const p = z * 100;
  return p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

export function screenToDoc(v: View, x: number, y: number): { x: number; y: number } {
  return { x: (x - v.panX) / v.zoom, y: (y - v.panY) / v.zoom };
}

export function docToScreen(v: View, x: number, y: number): { x: number; y: number } {
  return { x: x * v.zoom + v.panX, y: y * v.zoom + v.panY };
}
