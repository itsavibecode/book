// Text layout and rasterisation with Canvas2D, in node space.
//
// Bounds convention: measureText returns integer node-space bounds. For left-aligned point text
// the layout box starts at (0, 0). Center and right point text are aligned relative to x = 0, so
// their bounds extend to the left of 0 (negative x). Box text (width != null) lays out inside
// 0..width. Ink that overhangs the box (italics, wide glyphs) widens the bounds so nothing clips;
// nodeBounds() is built from these bounds and is what the UI should hit-test against.
import type { Rect, TextNode } from './types';
import { createCanvas, get2d, makeImageData, type Ctx2D } from './util';

interface Line { text: string; x: number; baseline: number; width: number }
interface Layout { lines: Line[]; bounds: Rect; native: boolean }

let measureCtx: Ctx2D | null = null;
function mctx(): Ctx2D {
  if (!measureCtx) measureCtx = get2d(createCanvas(1, 1));
  return measureCtx;
}

export function fontString(n: TextNode): string {
  return `${n.italic ? 'italic ' : ''}${Math.round(n.weight)} ${n.size}px ${n.font}`;
}

/** Sets font and letter spacing; returns true when the browser handles letter spacing itself. */
function applyFont(ctx: Ctx2D, n: TextNode): boolean {
  ctx.font = fontString(n);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) {
    (ctx as { letterSpacing: string }).letterSpacing = `${n.letterSpacing}px`;
    return true;
  }
  return n.letterSpacing === 0;
}

function widthOf(ctx: Ctx2D, s: string, n: TextNode, native: boolean): number {
  if (native) return ctx.measureText(s).width;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width + n.letterSpacing;
  return w;
}

function wrapLine(ctx: Ctx2D, line: string, n: TextNode, native: boolean, maxW: number): string[] {
  const tokens = line.split(/(\s+)/).filter((t) => t.length > 0);
  const out: string[] = [];
  let cur = '';
  for (const tok of tokens) {
    const cand = cur + tok;
    if (cur.trim() === '' || widthOf(ctx, cand.trimEnd(), n, native) <= maxW) {
      cur = cand;
      continue;
    }
    out.push(cur.trimEnd());
    cur = /^\s+$/.test(tok) ? '' : tok;
    // A single word wider than the box breaks between characters.
    while (cur && widthOf(ctx, cur, n, native) > maxW && [...cur].length > 1) {
      const chars = [...cur];
      let k = 1;
      while (k < chars.length && widthOf(ctx, chars.slice(0, k + 1).join(''), n, native) <= maxW) k++;
      out.push(chars.slice(0, k).join(''));
      cur = chars.slice(k).join('');
    }
  }
  out.push(cur.trimEnd());
  return out;
}

function layout(ctx: Ctx2D, n: TextNode): Layout {
  const native = applyFont(ctx, n);
  const lineH = n.size * n.lineHeight;
  const fm = ctx.measureText('Mg');
  const asc = fm.fontBoundingBoxAscent || n.size * 0.8;
  const desc = fm.fontBoundingBoxDescent || n.size * 0.2;
  const raw = n.text.split('\n');
  const boxW = n.width !== null ? Math.max(1, n.width) : null;
  const texts = boxW !== null ? raw.flatMap((l) => wrapLine(ctx, l, n, native, boxW)) : raw;
  let x0 = boxW !== null ? 0 : Infinity, x1 = boxW !== null ? boxW : -Infinity;
  let y0 = 0, y1 = texts.length * lineH;
  const lines: Line[] = texts.map((text, i) => {
    const width = widthOf(ctx, text, n, native);
    let x: number;
    if (boxW !== null) x = n.align === 'center' ? (boxW - width) / 2 : n.align === 'right' ? boxW - width : 0;
    else x = n.align === 'center' ? -width / 2 : n.align === 'right' ? -width : 0;
    const baseline = i * lineH + (lineH - (asc + desc)) / 2 + asc;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x + width);
    if (text.length > 0) {
      const m = native ? ctx.measureText(text) : null;
      const il = m ? x - m.actualBoundingBoxLeft : x;
      const ir = m ? x + m.actualBoundingBoxRight : x + width;
      const it = m ? baseline - m.actualBoundingBoxAscent : baseline - asc;
      const ib = m ? baseline + m.actualBoundingBoxDescent : baseline + desc;
      x0 = Math.min(x0, il);
      x1 = Math.max(x1, ir);
      y0 = Math.min(y0, it);
      y1 = Math.max(y1, ib);
    }
    return { text, x, baseline, width };
  });
  if (!Number.isFinite(x0)) { x0 = 0; x1 = 0; }
  // One pixel of padding keeps antialiased edges inside the raster.
  const bx0 = Math.floor(x0) - 1, by0 = Math.floor(y0) - 1;
  const bx1 = Math.ceil(x1) + 1, by1 = Math.ceil(y1) + 1;
  return { lines, bounds: { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }, native };
}

function isEmpty(n: TextNode): boolean {
  return n.text.trim().length === 0;
}

export function measureText(node: TextNode): Rect {
  if (isEmpty(node) && node.width === null) {
    return { x: 0, y: 0, w: 0, h: Math.ceil(node.size * node.lineHeight) };
  }
  return layout(mctx(), node).bounds;
}

export function rasterizeText(node: TextNode): ImageData | null {
  if (isEmpty(node) || node.size <= 0) return null;
  const L = layout(mctx(), node);
  const b = L.bounds;
  if (b.w <= 0 || b.h <= 0) return null;
  const canvas = createCanvas(b.w, b.h);
  const ctx = get2d(canvas);
  const native = applyFont(ctx, node);
  const [r, g, bl, a] = node.color;
  // Draw opaque and apply alpha afterwards: canvas premultiplies, so painting translucent colour
  // and reading it back would shift the RGB of every fully covered pixel.
  ctx.fillStyle = `rgb(${r}, ${g}, ${bl})`;
  for (const line of L.lines) {
    if (!line.text) continue;
    const px = line.x - b.x, py = line.baseline - b.y;
    if (native) {
      ctx.fillText(line.text, px, py);
    } else {
      let x = px;
      for (const ch of line.text) {
        ctx.fillText(ch, x, py);
        x += ctx.measureText(ch).width + node.letterSpacing;
      }
    }
  }
  const img = ctx.getImageData(0, 0, b.w, b.h);
  const d = img.data;
  const k = Math.max(0, Math.min(255, a)) / 255;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    // Fully covered pixels get the exact colour; edges keep the canvas' AA estimate.
    if (d[i + 3] === 255) { d[i] = r; d[i + 1] = g; d[i + 2] = bl; }
    if (k < 1) d[i + 3] = d[i + 3] * k;
  }
  return makeImageData(b.w, b.h, d);
}
