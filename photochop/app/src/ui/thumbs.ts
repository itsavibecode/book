// Layer and mask thumbnails for the Layers panel. Rendered from compositor.renderNode (or the
// mask buffer), downscaled with createImageBitmap, cached per node and re-rendered at most
// every 300 ms per node, never during a pointer gesture.
import { effect, signal } from '@preact/signals';
import type { DocumentLike, NodeId } from '@/engine';
import { gestureActive, type DocTab } from '@/app/state';

export const THUMB_W = 40;
export const THUMB_H = 28;
/** Bumped when any thumbnail finishes rendering. */
export const thumbTick = signal(0);

interface Entry { stamp: number; bitmap: ImageBitmap | null; busy: boolean; last: number; timer?: ReturnType<typeof setTimeout> }

const stamps = new WeakMap<DocumentLike, Map<NodeId, number>>();
const entries = new Map<string, Entry>();
let tickQueued = false;

function bumpTick(): void {
  if (tickQueued) return;
  tickQueued = true;
  requestAnimationFrame(() => { tickQueued = false; thumbTick.value++; });
}

effect(() => { if (!gestureActive.value) bumpTick(); });

function stampsFor(doc: DocumentLike): Map<NodeId, number> {
  let m = stamps.get(doc);
  if (!m) {
    const map = new Map<NodeId, number>();
    m = map;
    stamps.set(doc, map);
    doc.subscribe((ev) => {
      if (ev.kind === 'pixels' || ev.kind === 'node') {
        map.set(ev.nodeId, (map.get(ev.nodeId) ?? 0) + 1);
        // Parents' thumbnails are not rendered (groups show a folder), so nothing else to bump.
      } else if (ev.kind === 'tree') {
        for (const k of map.keys()) map.set(k, (map.get(k) ?? 0) + 1);
      }
    });
  }
  return m;
}

export function thumbSize(doc: { width: number; height: number }): { w: number; h: number } {
  const s = Math.min(THUMB_W / doc.width, THUMB_H / doc.height);
  return { w: Math.max(1, Math.round(doc.width * s)), h: Math.max(1, Math.round(doc.height * s)) };
}

function maskImage(doc: DocumentLike, id: NodeId): ImageData | null {
  const n = doc.getNode(id);
  if (!n || !n.mask) return null;
  const { w, h, data } = n.mask;
  const img = new ImageData(w, h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    img.data[j] = img.data[j + 1] = img.data[j + 2] = data[i];
    img.data[j + 3] = 255;
  }
  return img;
}

/** Returns the cached bitmap (possibly stale) and schedules a refresh when needed. */
export function thumbFor(tab: DocTab, id: NodeId, kind: 'layer' | 'mask'): ImageBitmap | null {
  const doc = tab.doc;
  const key = `${tab.key}:${id}:${kind}`;
  const stamp = stampsFor(doc).get(id) ?? 0;
  let e = entries.get(key);
  if (!e) { e = { stamp: -1, bitmap: null, busy: false, last: 0 }; entries.set(key, e); }
  if (e.stamp !== stamp && !e.busy && !e.timer && !gestureActive.peek()) {
    const entry = e;
    const wait = Math.max(0, 300 - (performance.now() - entry.last));
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (gestureActive.peek()) return;
      const target = stampsFor(doc).get(id) ?? 0;
      entry.busy = true;
      entry.last = performance.now();
      let img: ImageData | null = null;
      try {
        img = kind === 'mask' ? maskImage(doc, id) : tab.compositor.renderNode(doc, id);
      } catch { img = null; }
      if (!img) { entry.busy = false; entry.stamp = target; return; }
      const size = thumbSize(doc);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      createImageBitmap(img, { resizeWidth: size.w * dpr, resizeHeight: size.h * dpr, resizeQuality: 'medium' })
        .then((bmp) => {
          // Close the old bitmap a little later: a row may still be drawing it this frame.
          const old = entry.bitmap;
          if (old) setTimeout(() => old.close(), 2000);
          entry.bitmap = bmp;
          entry.stamp = target;
        })
        .catch(() => { entry.stamp = target; })
        .finally(() => { entry.busy = false; bumpTick(); });
    }, wait);
  }
  return e.bitmap;
}

/** Drops cached thumbnails of a closed tab. */
export function dropThumbs(tabKey: number): void {
  for (const [k, e] of entries) {
    if (k.startsWith(`${tabKey}:`)) { const b = e.bitmap; if (b) setTimeout(() => b.close(), 2000); if (e.timer) clearTimeout(e.timer); entries.delete(k); }
  }
}
