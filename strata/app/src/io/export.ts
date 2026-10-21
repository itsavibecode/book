import type { CompositorLike, DocumentLike, ExportFormat, ExportOptions, ExportResult } from '@/engine/contract';
import { canvasToBlob, createCanvas, get2d } from '@/engine/util';

const MIME: Record<ExportFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXT: Record<ExportFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

export function exportFilename(doc: DocumentLike, format: ExportFormat): string {
  const base = doc.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled';
  return `${base}.${EXT[format]}`;
}

/** Draws the current composite at scale; the compositor is re-run so the export is never stale. */
async function encode(doc: DocumentLike, compositor: CompositorLike, format: ExportFormat, scale: number, quality: number): Promise<ExportResult> {
  compositor.composite(doc);
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = get2d(canvas);
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(compositor.canvas as CanvasImageSource, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, MIME[format], format === 'png' ? undefined : Math.max(0, Math.min(1, quality)));
  return { blob, width: w, height: h, filename: exportFilename(doc, format) };
}

export function exportImage(doc: DocumentLike, compositor: CompositorLike, opts: ExportOptions): Promise<ExportResult> {
  const scale = Math.max(0.01, Math.min(4, opts.scale));
  return encode(doc, compositor, opts.format, scale, opts.quality);
}

const SMALL_PIXELS = 2_000_000;
const SAMPLE_PIXELS = 500_000;

/** Encodes once (at full size for small documents, otherwise at a reduced scale) and extrapolates by pixel count. */
export async function estimateSize(doc: DocumentLike, compositor: CompositorLike, opts: ExportOptions): Promise<number> {
  const scale = Math.max(0.01, Math.min(4, opts.scale));
  const target = doc.width * doc.height * scale * scale;
  if (target <= SMALL_PIXELS) return (await encode(doc, compositor, opts.format, scale, opts.quality)).blob.size;
  const s = Math.min(scale, Math.sqrt(SAMPLE_PIXELS / (doc.width * doc.height)));
  const r = await encode(doc, compositor, opts.format, s, opts.quality);
  return Math.round(r.blob.size * (target / (r.width * r.height)));
}
