// Drawing for the two viewport canvases. The base canvas holds surround, checkerboard,
// document and pixel grid and redraws only when something changed; the overlay canvas holds
// marching ants, bounds, marquees and the brush ring and redraws every frame while animated.
import { maskOutline, type Selection } from '@/engine';
import type { DocTab } from '@/app/state';

const patterns = new Map<string, CanvasPattern>();

function checkerPattern(g: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  const key = String(dpr);
  const hit = patterns.get(key);
  if (hit) return hit;
  const cell = Math.max(1, Math.round(8 * dpr));
  const c = document.createElement('canvas');
  c.width = c.height = cell * 2;
  const cg = c.getContext('2d')!;
  cg.fillStyle = '#ffffff';
  cg.fillRect(0, 0, cell * 2, cell * 2);
  cg.fillStyle = '#d0d0d5';
  cg.fillRect(0, 0, cell, cell);
  cg.fillRect(cell, cell, cell, cell);
  const p = g.createPattern(c, 'repeat');
  if (p) patterns.set(key, p);
  return p;
}

export function drawBase(g: CanvasRenderingContext2D, W: number, H: number, dpr: number, tab: DocTab, surround: string, pixelGrid: boolean): void {
  const { doc, view } = tab;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = surround;
  g.fillRect(0, 0, W, H);
  const z = view.zoom * dpr;
  const ox = view.panX * dpr, oy = view.panY * dpr;
  const dw = doc.width * z, dh = doc.height * z;

  // Visible part of the document, in document pixels.
  const vx0 = Math.max(0, Math.floor(-ox / z)), vy0 = Math.max(0, Math.floor(-oy / z));
  const vx1 = Math.min(doc.width, Math.ceil((W - ox) / z)), vy1 = Math.min(doc.height, Math.ceil((H - oy) / z));
  if (vx1 <= vx0 || vy1 <= vy0) return;
  const sx = ox + vx0 * z, sy = oy + vy0 * z, sw = (vx1 - vx0) * z, sh = (vy1 - vy0) * z;

  // Soft shadow so the page reads as a sheet on the surround.
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 24 * dpr;
  g.shadowOffsetY = 6 * dpr;
  g.fillStyle = '#ffffff';
  g.fillRect(Math.max(sx, -100), Math.max(sy, -100), Math.min(sw, W + 200), Math.min(sh, H + 200));
  g.restore();

  // Checkerboard behind transparent areas, anchored to the document origin.
  const pat = checkerPattern(g, dpr);
  if (pat) {
    pat.setTransform(new DOMMatrix().translateSelf(ox, oy));
    g.fillStyle = pat;
    g.fillRect(sx, sy, sw, sh);
  }

  try {
    const src = tab.compositor.canvas as CanvasImageSource;
    g.imageSmoothingEnabled = view.zoom < 2;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, vx0, vy0, vx1 - vx0, vy1 - vy0, sx, sy, sw, sh);
  } catch { /* compositor not ready */ }

  if (pixelGrid && view.zoom >= 8) {
    g.save();
    g.strokeStyle = 'rgba(128,128,128,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = vx0; x <= vx1; x++) { const px = Math.round(ox + x * z) + 0.5; g.moveTo(px, sy); g.lineTo(px, sy + sh); }
    for (let y = vy0; y <= vy1; y++) { const py = Math.round(oy + y * z) + 0.5; g.moveTo(sx, py); g.lineTo(sx + sw, py); }
    g.stroke();
    g.restore();
  }
  void dw; void dh;
}

const antsCache = new WeakMap<Selection, Path2D>();

function antsPath(sel: Selection): Path2D {
  const hit = antsCache.get(sel);
  if (hit) return hit;
  const seg = maskOutline(sel.mask);
  const p = new Path2D();
  for (let i = 0; i + 3 < seg.length; i += 4) {
    p.moveTo(seg[i], seg[i + 1]);
    p.lineTo(seg[i + 2], seg[i + 3]);
  }
  antsCache.set(sel, p);
  return p;
}

/** Marching ants in document space; `phase` advances each frame. */
export function drawAnts(g: CanvasRenderingContext2D, dpr: number, tab: DocTab, phase: number): void {
  const sel = tab.doc.selection;
  if (!sel) return;
  let path: Path2D;
  try { path = antsPath(sel); } catch { return; }
  const v = tab.view;
  g.save();
  g.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY);
  g.lineWidth = 1 / v.zoom;
  const dash = 4 / v.zoom;
  g.setLineDash([dash, dash]);
  g.lineDashOffset = -phase / v.zoom;
  g.strokeStyle = '#ffffff';
  g.stroke(path);
  g.lineDashOffset = -phase / v.zoom + dash;
  g.strokeStyle = '#000000';
  g.stroke(path);
  g.restore();
}
