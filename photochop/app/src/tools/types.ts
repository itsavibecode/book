// The shape every canvas tool implements. Tools are plain TypeScript (no framework in the hot
// path); the viewport calls them with document-space points and a small context object.
import type { CompositorLike, DocumentLike, Point } from '@/engine';
import type { DocTab, View } from '@/app/state';

export interface ToolPointer {
  /** Document space (float). */
  doc: Point;
  /** Viewport CSS pixels. */
  screen: Point;
  /** 0..1, 0.5 for a mouse with a button pressed. */
  pressure: number;
  pointerType: string;
  button: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  /** Intermediate points since the last move (coalesced events), oldest first, ending with this one. */
  coalesced: Array<{ doc: Point; pressure: number }>;
  /** Milliseconds timestamp from the event. */
  time: number;
}

export interface ToolContext {
  tab: DocTab;
  doc: DocumentLike;
  compositor: CompositorLike;
  view: View;
  /** Ask the viewport to redraw the overlay layer (marquee, cursor, bounds). */
  redrawOverlay(): void;
  /** Overrides the CSS cursor until the next call with null. */
  setCursor(cursor: string | null): void;
  toScreen(p: Point): Point;
  toDoc(p: Point): Point;
}

export interface Tool {
  id: string;
  /** CSS cursor while hovering the canvas. */
  cursor: string | ((ctx: ToolContext) => string);
  onDown(ctx: ToolContext, p: ToolPointer): void;
  onMove(ctx: ToolContext, p: ToolPointer): void;
  onUp(ctx: ToolContext, p: ToolPointer): void;
  /** Pointer moved without a button (cursor ring, hover feedback). */
  onHover?(ctx: ToolContext, p: ToolPointer | null): void;
  onDoubleClick?(ctx: ToolContext, p: ToolPointer): void;
  /** Keyboard while the canvas has focus. Return true when handled. */
  onKey?(ctx: ToolContext, e: KeyboardEvent): boolean;
  /** Abort an in-progress gesture (second finger landed, tool switched, Escape). */
  onCancel?(ctx: ToolContext): void;
  /** Draw on the overlay in viewport CSS pixels (the context is already scaled for devicePixelRatio). */
  renderOverlay?(ctx: ToolContext, g: CanvasRenderingContext2D): void;
}
