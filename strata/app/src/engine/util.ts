// Small helpers shared across the engine. Nothing here touches the DOM beyond canvas creation.
import type { Rect } from './types';

export type Canvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Real ImageData when the environment has it (browsers, workers); a structural stand-in in Node so the engine stays unit-testable. */
export function makeImageData(w: number, h: number, data?: Uint8ClampedArray): ImageData {
  const buf = data ?? new Uint8ClampedArray(w * h * 4);
  if (typeof ImageData !== 'undefined' && w > 0 && h > 0) {
    return new ImageData(buf as Uint8ClampedArray<ArrayBuffer>, w, h);
  }
  return { width: w, height: h, data: buf, colorSpace: 'srgb' } as unknown as ImageData;
}

export function canCreateCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
}

export function createCanvas(w: number, h: number): Canvas {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(cw, ch);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    return c;
  }
  throw new Error('No canvas is available in this environment');
}

export function get2d(canvas: Canvas): Ctx2D {
  const ctx = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) throw new Error('Canvas 2D is not available');
  return ctx;
}

export async function canvasToBlob(canvas: Canvas, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), type, quality);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read the image'));
    r.readAsDataURL(blob);
  });
}

export function rectUnion(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function rectIntersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || btm <= y) return null;
  return { x, y, w: r - x, h: btm - y };
}

/** Smallest integer rect that contains r (normalises negative sizes). */
export function rectOuter(r: Rect): Rect {
  const x0 = Math.floor(Math.min(r.x, r.x + r.w));
  const y0 = Math.floor(Math.min(r.y, r.y + r.h));
  const x1 = Math.ceil(Math.max(r.x, r.x + r.w));
  const y1 = Math.ceil(Math.max(r.y, r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
