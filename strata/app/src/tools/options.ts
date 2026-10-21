// Per-tool options shown in the context bar. Persisted as one settings object.
import type { RGBA, TextAlign } from '@/engine';

export type SelectMode = 'replace' | 'add' | 'subtract' | 'intersect';

export interface PaintOptions {
  /** px, 1..500 */
  size: number;
  /** percent 0..100 */
  hardness: number;
  opacity: number;
  flow: number;
  /** percent of size, 1..200 */
  spacing: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
}

export interface ToolOptions {
  move: { autoSelect: boolean };
  select: { mode: SelectMode };
  brush: PaintOptions;
  eraser: PaintOptions;
  fill: { tolerance: number; contiguous: boolean };
  text: { font: string; size: number; weight: number; italic: boolean; align: TextAlign };
  shape: { fillOn: boolean; strokeOn: boolean; strokeColor: RGBA; strokeWidth: number; radius: number };
  zoom: { mode: 'in' | 'out' };
  eyedropper: { sample: 'all' | 'active' };
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  move: { autoSelect: false },
  select: { mode: 'replace' },
  brush: { size: 24, hardness: 80, opacity: 100, flow: 100, spacing: 10, pressureSize: true, pressureOpacity: false },
  eraser: { size: 40, hardness: 80, opacity: 100, flow: 100, spacing: 10, pressureSize: true, pressureOpacity: false },
  fill: { tolerance: 32, contiguous: true },
  text: { font: 'system-ui', size: 64, weight: 700, italic: false, align: 'left' },
  shape: { fillOn: true, strokeOn: false, strokeColor: [0, 0, 0, 255], strokeWidth: 4, radius: 0 },
  zoom: { mode: 'in' },
  eyedropper: { sample: 'all' },
};

/** Fills in keys added in later versions so an old saved object never breaks the bar. */
export function mergeToolOptions(saved: unknown): ToolOptions {
  const out = structuredClone(DEFAULT_TOOL_OPTIONS) as unknown as Record<string, Record<string, unknown>>;
  if (saved && typeof saved === 'object') {
    for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
      if (out[k] && v && typeof v === 'object') Object.assign(out[k], v);
    }
  }
  return out as unknown as ToolOptions;
}

export const TEXT_FONTS = [
  'system-ui', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS',
];

export const TEXT_WEIGHTS: Array<[number, string]> = [
  [300, 'Light'], [400, 'Regular'], [600, 'Semibold'], [700, 'Bold'], [900, 'Black'],
];

/** CSS font-family value for one of TEXT_FONTS. */
export function fontStack(font: string): string {
  if (font === 'system-ui') return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  return /\s/.test(font) ? `"${font}"` : font;
}

/** Reverse of fontStack for display: first family without quotes. */
export function fontLabel(stack: string): string {
  const first = stack.split(',')[0].trim().replace(/^["']|["']$/g, '');
  return first || 'system-ui';
}
