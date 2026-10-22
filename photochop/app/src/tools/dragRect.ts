// Shared drag-a-box maths for the select and shape tools: Shift constrains to a square or
// circle, Alt draws from the centre. Results are in document space.
import type { Point, Rect } from '@/engine';

export function dragRect(start: Point, now: Point, constrain: boolean, fromCentre: boolean): Rect {
  let dx = now.x - start.x, dy = now.y - start.y;
  if (constrain) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  if (fromCentre) {
    return { x: start.x - Math.abs(dx), y: start.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 };
  }
  return { x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

export function roundRect(r: Rect): Rect {
  const x = Math.round(r.x), y = Math.round(r.y);
  return { x, y, w: Math.round(r.x + r.w) - x, h: Math.round(r.y + r.h) - y };
}

/** Draws a two-colour dashed rect or ellipse outline in screen space. */
export function strokeMarquee(g: CanvasRenderingContext2D, r: Rect, ellipse: boolean, offset = 0): void {
  g.save();
  g.lineWidth = 1;
  const path = () => {
    g.beginPath();
    if (ellipse) g.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
    else g.rect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
  };
  g.setLineDash([4, 4]);
  g.lineDashOffset = -offset;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  path(); g.stroke();
  g.lineDashOffset = -offset + 4;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  path(); g.stroke();
  g.restore();
}
