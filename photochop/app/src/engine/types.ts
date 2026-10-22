// Data model shared by the engine, the tools and the UI. Pure types, no runtime code.
// Rule: everything here is serialisable except the live TileStore / Mask buffers, which
// serialize.ts turns into blobs. Keep this file framework-free.

export type NodeId = string;
export type DocId = string;

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
/** 0..255 per channel, straight (non-premultiplied) alpha. */
export type RGBA = [number, number, number, number];

export const TILE = 256;

/** The full Photoshop set. Only BLEND_MODES_IMPLEMENTED render in 0.1.0; others fall back to normal. */
export type BlendMode =
  | 'normal' | 'dissolve'
  | 'darken' | 'multiply' | 'color-burn' | 'linear-burn' | 'darker-color'
  | 'lighten' | 'screen' | 'color-dodge' | 'linear-dodge' | 'lighter-color'
  | 'overlay' | 'soft-light' | 'hard-light' | 'vivid-light' | 'linear-light' | 'pin-light' | 'hard-mix'
  | 'difference' | 'exclusion' | 'subtract' | 'divide'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

/** Blend modes the 0.1.0 compositor implements on both GL and CPU. The UI offers only these. */
export const BLEND_MODES_IMPLEMENTED: readonly BlendMode[] = [
  'normal', 'darken', 'multiply', 'lighten', 'screen', 'overlay', 'soft-light', 'hard-light', 'difference', 'exclusion',
];

export const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  'normal': 'Normal', 'dissolve': 'Dissolve',
  'darken': 'Darken', 'multiply': 'Multiply', 'color-burn': 'Color burn', 'linear-burn': 'Linear burn', 'darker-color': 'Darker color',
  'lighten': 'Lighten', 'screen': 'Screen', 'color-dodge': 'Color dodge', 'linear-dodge': 'Linear dodge (add)', 'lighter-color': 'Lighter color',
  'overlay': 'Overlay', 'soft-light': 'Soft light', 'hard-light': 'Hard light', 'vivid-light': 'Vivid light', 'linear-light': 'Linear light', 'pin-light': 'Pin light', 'hard-mix': 'Hard mix',
  'difference': 'Difference', 'exclusion': 'Exclusion', 'subtract': 'Subtract', 'divide': 'Divide',
  'hue': 'Hue', 'saturation': 'Saturation', 'color': 'Color', 'luminosity': 'Luminosity',
};

export type NodeType = 'raster' | 'text' | 'shape' | 'group';

/**
 * A document-sized 8-bit coverage buffer (0 = hidden, 255 = fully shown).
 * Used for layer masks and for the selection. Always exactly doc.width * doc.height bytes.
 */
export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

/** Selection = mask + cached bounds of its non-zero area (null bounds when empty). */
export interface Selection {
  mask: Mask;
  bounds: Rect;
}

export interface NodeBase {
  id: NodeId;
  type: NodeType;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0..1 */
  opacity: number;
  blend: BlendMode;
  /** Offset of the node's own coordinate space from document space, in document pixels. Integers for raster nodes. */
  x: number;
  y: number;
  /** Layer mask in document space (not node space). null = no mask. */
  mask: Mask | null;
  /** When false the mask exists but is ignored (Shift-click on the mask thumbnail). */
  maskEnabled: boolean;
  /** Reserved for 0.3.0 live effects. Always [] in 0.1.0; serialized so files stay forward-compatible. */
  effects: unknown[];
}

export interface RasterNode extends NodeBase {
  type: 'raster';
  /** Sparse 256 px RGBA8 tiles in node space (tile (0,0) covers node pixels 0..255). */
  tiles: TileStore;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextNode extends NodeBase {
  type: 'text';
  /** Raw text; '\n' separates lines. */
  text: string;
  /** CSS font-family string, e.g. 'system-ui' or '"Georgia", serif'. */
  font: string;
  /** px */
  size: number;
  /** 100..900 */
  weight: number;
  italic: boolean;
  color: RGBA;
  align: TextAlign;
  /** multiplier, 1.2 = 120% */
  lineHeight: number;
  /** px, may be negative */
  letterSpacing: number;
  /** Box width for wrapping; null = point text (no wrap). */
  width: number | null;
}

export type ShapeKind = 'rect' | 'ellipse';

export interface ShapeNode extends NodeBase {
  type: 'shape';
  shape: ShapeKind;
  /** Size in node space; the shape occupies (x, y, w, h) in document space. */
  w: number;
  h: number;
  /** Corner radius for rect, ignored for ellipse. */
  radius: number;
  fill: RGBA | null;
  stroke: RGBA | null;
  strokeWidth: number;
}

export interface GroupNode extends NodeBase {
  type: 'group';
  /** Bottom to top (index 0 renders first). Same convention everywhere in the engine. */
  children: AnyNode[];
  /** Layers panel disclosure state; persisted. */
  expanded: boolean;
}

export type AnyNode = RasterNode | TextNode | ShapeNode | GroupNode;

/**
 * Sparse tile storage for one raster node. Keys are `${tx},${ty}` with tx, ty integer tile
 * indices (may be negative). A missing tile is fully transparent. Tile buffers are
 * Uint8ClampedArray of length TILE*TILE*4, RGBA, straight alpha, row-major.
 */
export interface TileStore {
  /** Returns the tile buffer or undefined when the tile does not exist. Never allocates. */
  get(tx: number, ty: number): Uint8ClampedArray | undefined;
  /** Returns the tile, allocating a transparent one if needed. */
  getOrCreate(tx: number, ty: number): Uint8ClampedArray;
  /** Replaces or removes (buf = undefined) a tile. */
  set(tx: number, ty: number, buf: Uint8ClampedArray | undefined): void;
  has(tx: number, ty: number): boolean;
  /** Iterates existing tiles. */
  forEach(fn: (buf: Uint8ClampedArray, tx: number, ty: number) => void): void;
  keys(): string[];
  /** Number of allocated tiles. */
  readonly size: number;
  /** Bounding rect in node pixels of all allocated tiles (null when empty). Not trimmed to non-transparent pixels. */
  bounds(): Rect | null;
  /** Copies a node-space rect into a fresh ImageData (transparent where tiles are missing). */
  read(rect: Rect): ImageData;
  /** Writes an ImageData into node space at (x, y), replacing pixels (no blending). Creates tiles as needed. */
  write(img: ImageData, x: number, y: number): void;
  /** Deep copy. */
  clone(): TileStore;
  /** Drops tiles that are entirely transparent. Returns the number removed. */
  prune(): number;
}

/** Everything the history needs to undo a raster edit: the tiles as they were before and after. */
export interface TilePatch {
  nodeId: NodeId;
  tx: number;
  ty: number;
  /** undefined = tile did not exist */
  before: Uint8ClampedArray | undefined;
  after: Uint8ClampedArray | undefined;
}

export interface DocumentMeta {
  id: DocId;
  name: string;
  width: number;
  height: number;
  /** ms since epoch */
  createdAt: number;
  updatedAt: number;
  /** Small PNG data URL for the start screen's Recent grid, generated on save. */
  thumbnail?: string;
}

/** What changed, so the UI can re-render selectively. */
export type ChangeEvent =
  | { kind: 'pixels'; nodeId: NodeId; rect: Rect }          // rect in document space
  | { kind: 'node'; nodeId: NodeId }                        // props or mask of one node
  | { kind: 'tree' }                                        // add / remove / move / reparent
  | { kind: 'selection' }
  | { kind: 'document' }                                    // name, size
  | { kind: 'active' };                                     // active or selected layer ids
