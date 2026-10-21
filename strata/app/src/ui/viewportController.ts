// The viewport's engine room (plain TypeScript, no framework in the hot path): canvas sizing,
// compositing on demand, the redraw loop, pointer / wheel / touch gestures, and routing to the
// active tool. Viewport.tsx mounts one controller and hands it the active tab.
import { effect } from '@preact/signals';
import type { ChangeEvent, Point, Rect } from '@/engine';
import { canvasRef } from '@/app/shortcuts';
import {
  activeTab, docVersion, gestureActive, pixelGrid, pointerDoc, setView, toolId, viewVersion, type DocTab,
} from '@/app/state';
import { surroundColour } from '@/app/theme';
import { clampPan, fitView, panBy, screenToDoc, docToScreen, setPaneSize, zoomTo, MIN_ZOOM, MAX_ZOOM } from '@/app/view';
import { clamp } from '@/app/util';
import { currentTool, onToolChange } from '@/tools';
import type { Tool, ToolContext, ToolPointer } from '@/tools/types';
import { drawAnts, drawBase } from './viewportDraw';

interface TouchState { pts: Map<number, Point>; startT: number; maxCount: number; moved: boolean; d0: number; mid0: Point; zoom0: number; anchor: Point }

function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export class ViewportController {
  wrap!: HTMLElement;
  base!: HTMLCanvasElement;
  overlay!: HTMLCanvasElement;
  bg!: CanvasRenderingContext2D;
  og!: CanvasRenderingContext2D;
  dpr = 1;
  cssW = 0;
  cssH = 0;
  tab: DocTab | null = null;
  private unsubDoc: (() => void) | null = null;
  private disposers: Array<() => void> = [];
  private baseDirty = true;
  private overlayDirty = true;
  private compFull = true;
  private compRect: Rect | null = null;
  private raf = 0;
  private phase = 0;
  private activePointer: number | null = null;
  private panning: { last: Point } | null = null;
  private spaceDown = false;
  private cursorOverride: string | null = null;
  private touch: TouchState | null = null;
  private lastMoveTool: Tool | undefined;

  mount(wrap: HTMLElement, base: HTMLCanvasElement, overlay: HTMLCanvasElement): void {
    this.wrap = wrap;
    this.base = base;
    this.overlay = overlay;
    this.bg = base.getContext('2d', { alpha: false })!;
    this.og = overlay.getContext('2d')!;
    canvasRef.current = overlay;
    canvasRef.onKey = (e) => this.onCanvasKey(e);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(wrap);
    this.disposers.push(() => ro.disconnect());
    this.resize();

    const dprMq = () => {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      const h = () => { this.resize(); dprMq(); };
      mq.addEventListener('change', h, { once: true });
    };
    dprMq();

    this.disposers.push(effect(() => { void viewVersion.value; void surroundColour.value; void pixelGrid.value; this.baseDirty = true; this.overlayDirty = true; this.kick(); }));
    this.disposers.push(effect(() => { void docVersion.value; void toolId.value; this.overlayDirty = true; this.updateCursor(); this.kick(); }));
    this.disposers.push(onToolChange(() => this.cancelGesture()));

    const o = overlay;
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on(o, 'pointerdown', (e) => this.onDown(e));
    on(o, 'pointermove', (e) => this.onMove(e));
    on(o, 'pointerup', (e) => this.onUp(e));
    on(o, 'pointercancel', (e) => this.onUp(e, true));
    on(o, 'pointerleave', () => { pointerDoc.value = null; if (this.activePointer === null) this.tool()?.onHover?.(this.ctx()!, null); this.overlayDirty = true; this.kick(); });
    on(o, 'dblclick', (e) => { const c = this.ctx(); if (c) this.tool()?.onDoubleClick?.(c, this.ptr(e as unknown as PointerEvent)); });
    on(o, 'contextmenu', (e) => e.preventDefault());
    on(wrap, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(window, 'keydown', (e) => this.onSpace(e as KeyboardEvent, true));
    on(window, 'keyup', (e) => this.onSpace(e as KeyboardEvent, false));
    on(window, 'blur', () => { this.spaceDown = false; this.updateCursor(); });
    // Safari pinch
    on(wrap, 'gesturestart' as keyof HTMLElementEventMap, (e) => e.preventDefault());
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.unsubDoc?.();
    this.disposers.forEach((d) => d());
    this.disposers = [];
    if (canvasRef.current === this.overlay) { canvasRef.current = null; canvasRef.onKey = null; }
  }

  setTab(tab: DocTab | null): void {
    if (tab === this.tab) return;
    this.cancelGesture();
    this.unsubDoc?.();
    this.unsubDoc = null;
    this.tab = tab;
    this.compFull = true;
    this.baseDirty = this.overlayDirty = true;
    if (tab) {
      this.unsubDoc = tab.doc.subscribe((ev) => this.onDocEvent(ev));
      if ((tab.needsFit || tab.autoFit) && this.cssW > 0) { tab.needsFit = false; setView(tab, fitView(tab)); }
    }
    this.updateCursor();
    this.kick();
  }

  private onDocEvent(ev: ChangeEvent): void {
    if (ev.kind === 'pixels') this.compRect = unionRect(this.compRect, ev.rect);
    else if (ev.kind === 'selection' || ev.kind === 'active') { this.overlayDirty = true; this.kick(); return; }
    else this.compFull = true;
    this.baseDirty = true;
    this.overlayDirty = true;
    this.kick();
  }

  private resize(): void {
    const r = this.wrap.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.cssW = Math.max(1, Math.round(r.width));
    this.cssH = Math.max(1, Math.round(r.height));
    for (const c of [this.base, this.overlay]) {
      c.width = Math.round(this.cssW * this.dpr);
      c.height = Math.round(this.cssH * this.dpr);
      c.style.width = `${this.cssW}px`;
      c.style.height = `${this.cssH}px`;
    }
    setPaneSize(this.cssW, this.cssH);
    const t = this.tab;
    if (t && (t.needsFit || t.autoFit)) { t.needsFit = false; setView(t, fitView(t)); }
    this.baseDirty = this.overlayDirty = true;
    this.kick();
  }

  /** Schedules a frame if one is not pending. */
  kick(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = 0;
    const tab = this.tab;
    if (!tab) {
      this.bg.setTransform(1, 0, 0, 1, 0, 0);
      this.bg.fillStyle = surroundColour.peek();
      this.bg.fillRect(0, 0, this.base.width, this.base.height);
      this.og.clearRect(0, 0, this.overlay.width, this.overlay.height);
      return;
    }
    if (this.compFull || this.compRect) {
      try {
        tab.compositor.composite(tab.doc, this.compFull ? undefined : { dirty: this.compRect! });
      } catch (e) { console.warn('composite failed', e); }
      this.compFull = false;
      this.compRect = null;
      this.baseDirty = true;
    }
    if (this.baseDirty) {
      this.baseDirty = false;
      drawBase(this.bg, this.base.width, this.base.height, this.dpr, tab, surroundColour.peek(), pixelGrid.peek());
    }
    const animate = !!tab.doc.selection;
    if (this.overlayDirty || animate) {
      this.overlayDirty = false;
      const g = this.og;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.overlay.width, this.overlay.height);
      if (animate) {
        this.phase = (this.phase + 0.35) % 8;
        drawAnts(g, this.dpr, tab, this.phase);
      }
      const ctx = this.ctx();
      const tool = this.tool();
      if (ctx && tool?.renderOverlay) {
        g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        try { tool.renderOverlay(ctx, g); } catch { /* overlay is cosmetic */ }
      }
    }
    if (animate) this.kick();
  }

  // ---- tool plumbing --------------------------------------------------------------------------

  private tool(): Tool | undefined {
    return currentTool();
  }

  ctx(): ToolContext | null {
    const tab = this.tab;
    if (!tab) return null;
    return {
      tab, doc: tab.doc, compositor: tab.compositor, view: tab.view,
      redrawOverlay: () => { this.overlayDirty = true; this.kick(); },
      setCursor: (c) => { this.cursorOverride = c; this.updateCursor(); },
      toScreen: (p) => docToScreen(tab.view, p.x, p.y),
      toDoc: (p) => screenToDoc(tab.view, p.x, p.y),
    };
  }

  private local(e: { clientX: number; clientY: number }): Point {
    const r = this.overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private ptr(e: PointerEvent, withCoalesced = false): ToolPointer {
    const tab = this.tab!;
    const screen = this.local(e);
    const pressureOf = (ev: PointerEvent) => (ev.pointerType === 'mouse' ? 0.5 : ev.pressure || 0.5);
    const list = withCoalesced && typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const coalesced = (list.length ? list : [e]).map((ev) => ({ doc: screenToDoc(tab.view, this.local(ev).x, this.local(ev).y), pressure: pressureOf(ev) }));
    return {
      doc: screenToDoc(tab.view, screen.x, screen.y), screen, pressure: pressureOf(e), pointerType: e.pointerType || 'mouse',
      button: e.button, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, coalesced, time: e.timeStamp,
    };
  }

  updateCursor(): void {
    if (!this.overlay) return;
    let c = 'default';
    if (this.panning) c = 'grabbing';
    else if (this.spaceDown) c = 'grab';
    else if (this.cursorOverride) c = this.cursorOverride;
    else {
      const t = this.tool();
      const ctx = this.ctx();
      if (t && ctx) c = typeof t.cursor === 'function' ? t.cursor(ctx) : t.cursor;
    }
    if (this.overlay.style.cursor !== c) this.overlay.style.cursor = c;
  }

  private cancelGesture(): void {
    const ctx = this.ctx();
    if (this.activePointer !== null && ctx) {
      try { this.lastMoveTool?.onCancel?.(ctx); } catch { /* ignore */ }
    }
    this.activePointer = null;
    this.panning = null;
    gestureActive.value = false;
  }

  // ---- pointer events -------------------------------------------------------------------------

  private onDown(e: PointerEvent): void {
    const tab = this.tab;
    if (!tab) return;
    // Focus the canvas ourselves and suppress the mousedown default, so a tool that moves focus
    // elsewhere during onDown (the text tool's editor) keeps it.
    e.preventDefault();
    this.overlay.focus({ preventScroll: true });
    if (e.pointerType === 'touch') {
      if (!this.touch) this.touch = { pts: new Map(), startT: e.timeStamp, maxCount: 0, moved: false, d0: 0, mid0: { x: 0, y: 0 }, zoom0: tab.view.zoom, anchor: { x: 0, y: 0 } };
      this.touch.pts.set(e.pointerId, this.local(e));
      this.touch.maxCount = Math.max(this.touch.maxCount, this.touch.pts.size);
      if (this.touch.pts.size >= 2) {
        this.cancelGesture();
        this.startPinch();
        return;
      }
    }
    if (e.button === 2) return;
    try { this.overlay.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (e.button === 1 || this.spaceDown) {
      e.preventDefault();
      this.panning = { last: this.local(e) };
      this.activePointer = e.pointerId;
      this.updateCursor();
      return;
    }
    if (e.button !== 0) return;
    const ctx = this.ctx()!;
    this.activePointer = e.pointerId;
    this.lastMoveTool = this.tool();
    gestureActive.value = true;
    this.lastMoveTool?.onDown(ctx, this.ptr(e));
    this.overlayDirty = true;
    this.kick();
  }

  private onMove(e: PointerEvent): void {
    const tab = this.tab;
    if (!tab) return;
    const p = this.local(e);
    const d = screenToDoc(tab.view, p.x, p.y);
    pointerDoc.value = d.x >= 0 && d.y >= 0 && d.x < tab.doc.width && d.y < tab.doc.height ? { x: Math.floor(d.x), y: Math.floor(d.y) } : null;

    if (this.touch && this.touch.pts.has(e.pointerId)) {
      const prev = this.touch.pts.get(e.pointerId)!;
      if (Math.hypot(p.x - prev.x, p.y - prev.y) > 8) this.touch.moved = true;
      if (this.touch.pts.size >= 2) {
        this.touch.pts.set(e.pointerId, p);
        this.updatePinch();
        return;
      }
    }
    if (this.panning && this.activePointer === e.pointerId) {
      panBy(tab, p.x - this.panning.last.x, p.y - this.panning.last.y);
      this.panning.last = p;
      return;
    }
    const ctx = this.ctx()!;
    if (this.activePointer === e.pointerId) {
      this.lastMoveTool?.onMove(ctx, this.ptr(e, true));
    } else if (this.activePointer === null && e.buttons === 0) {
      this.tool()?.onHover?.(ctx, this.ptr(e));
    }
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    if (this.touch) {
      const t = this.touch;
      t.pts.delete(e.pointerId);
      if (t.pts.size === 0) {
        const quick = e.timeStamp - t.startT < 320 && !t.moved;
        this.touch = null;
        if (quick && t.maxCount === 2) { this.cancelGesture(); activeTab.peek()?.doc.history.undo(); return; }
        if (quick && t.maxCount === 3) { this.cancelGesture(); activeTab.peek()?.doc.history.redo(); return; }
        if (t.maxCount >= 2) return;
      } else if (t.maxCount >= 2) {
        return;
      }
    }
    if (this.activePointer !== e.pointerId) return;
    try { this.overlay.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    this.activePointer = null;
    if (this.panning) { this.panning = null; this.updateCursor(); return; }
    const ctx = this.ctx();
    gestureActive.value = false;
    if (!ctx) return;
    if (cancelled) this.lastMoveTool?.onCancel?.(ctx);
    else this.lastMoveTool?.onUp(ctx, this.ptr(e));
    this.overlayDirty = true;
    this.kick();
    this.updateCursor();
  }

  private startPinch(): void {
    const t = this.touch!, tab = this.tab!;
    const [a, b] = Array.from(t.pts.values());
    t.d0 = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    t.mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    t.zoom0 = tab.view.zoom;
    t.anchor = screenToDoc(tab.view, t.mid0.x, t.mid0.y);
  }

  private updatePinch(): void {
    const t = this.touch!, tab = this.tab!;
    const [a, b] = Array.from(t.pts.values());
    const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (Math.abs(d - t.d0) > 8 || Math.hypot(mid.x - t.mid0.x, mid.y - t.mid0.y) > 8) t.moved = true;
    const zoom = clamp(t.zoom0 * (d / t.d0), MIN_ZOOM, MAX_ZOOM);
    tab.autoFit = false;
    setView(tab, clampPan(tab, { zoom, panX: mid.x - t.anchor.x * zoom, panY: mid.y - t.anchor.y * zoom }));
  }

  private onWheel(e: WheelEvent): void {
    const tab = this.tab;
    if (!tab) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.cssH : 1;
    const dx = e.deltaX * scale, dy = e.deltaY * scale;
    const at = this.local(e);
    if (e.ctrlKey || e.metaKey) {
      const f = Math.pow(1.0018, -clamp(dy, -120, 120));
      zoomTo(tab, tab.view.zoom * f, at);
    } else if (e.shiftKey && !dx) {
      panBy(tab, -dy, 0);
    } else {
      panBy(tab, -dx, -dy);
    }
  }

  private onSpace(e: KeyboardEvent, down: boolean): void {
    if (e.code !== 'Space') return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['checkbox', 'range', 'radio', 'button'].includes(t.type)));
    if (typing) return;
    if (down && !(t === this.overlay || t === document.body)) return;
    if (down) e.preventDefault();
    if (this.spaceDown !== down) {
      this.spaceDown = down;
      this.updateCursor();
    }
  }

  private onCanvasKey(e: KeyboardEvent): boolean {
    if (e.code === 'Space') return true;
    const ctx = this.ctx();
    const tool = this.tool();
    if (!ctx || !tool?.onKey) return false;
    const handled = tool.onKey(ctx, e);
    if (handled) { this.overlayDirty = true; this.kick(); }
    return handled;
  }
}
