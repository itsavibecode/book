// THE CONTRACT between the engine (src/engine, src/io) and the UI (src/app, src/ui, src/tools).
//
// The engine implements every interface and function signature below and re-exports the
// concrete implementations from src/engine/index.ts and src/io/index.ts under EXACTLY these
// names. The UI imports only from '@/engine' and '@/io' and never reaches into engine files.
// If something here turns out to be wrong, change this file first and say so in the hand-over
// note; both sides are built against it in parallel.
//
// Coordinate spaces:
//   document space  : pixels of the document, origin top-left, y down.
//   node space      : document space minus (node.x, node.y). Raster tiles, shape w/h and text
//                     layout live in node space.
//   screen space    : CSS pixels of the viewport canvas; the UI owns the view transform.

import type {
  AnyNode, BlendMode, ChangeEvent, DocId, DocumentMeta, GroupNode, Guide, Interpolation, Mask, Mat3,
  NodeId, Point, RGBA, RasterNode, Rect, SavedSelection, Selection, ShapeNode, TextNode, TileStore,
  WarpGrid, WarpPreset,
} from './types';

// ---------------------------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------------------------

export interface DocumentLike {
  readonly id: DocId;
  name: string;
  /** Readonly for the UI; changes only through the document commands (resizeCanvas, resizeImage, rotateDocument, ...). */
  readonly width: number;
  readonly height: number;
  /** Invisible root group; its children are the top-level layers, bottom to top. */
  readonly root: GroupNode;
  selection: Selection | null;
  /** The layer that tools paint on / the Inspector shows. */
  activeId: NodeId | null;
  /** Multi-selection in the Layers panel; always contains activeId when non-empty. */
  selectedIds: NodeId[];
  readonly history: HistoryLike;
  /** Increments on every change; cheap to compare in the UI. */
  readonly version: number;
  readonly createdAt: number;
  updatedAt: number;
  /** Pixels per inch, metadata only (Image size dialog, ruler units). Default 72. */
  dpi: number;
  /** Ruler guides, document space. Mutated only through commands. */
  readonly guides: readonly Guide[];
  /** Selections saved in the document. Mutated only through commands. */
  readonly savedSelections: readonly SavedSelection[];

  getNode(id: NodeId): AnyNode | undefined;
  parentOf(id: NodeId): GroupNode | undefined;
  /** Index of id inside its parent's children. -1 when not found. */
  indexOf(id: NodeId): number;
  /** Depth-first, TOP to BOTTOM as the Layers panel shows them (last child first), with depth. */
  flatten(): Array<{ node: AnyNode; depth: number; parent: GroupNode }>;
  /** Bottom-to-top render order, visible or not, excluding groups themselves (groups are composited by the compositor). */
  activeNode(): AnyNode | undefined;
  /** Document-space bounds of a node's content (tiles bounds, text layout, shape rect). null when empty. */
  nodeBounds(id: NodeId): Rect | null;
  /**
   * Tight document-space bounds of what the node shows: rasters = box of pixels with alpha > 0
   * (integers); text and shape = the same transformed bounds as nodeBounds; groups = union of the
   * children's contentBounds. null when empty. Cached (per tile store), so it is cheap to call on
   * every pointer move. Use it for transform boxes and as the warp grid's source rect.
   */
  contentBounds(id: NodeId): Rect | null;

  /** Subscribe to changes. Returns an unsubscribe function. Every mutation (command do/undo/redo) emits. */
  subscribe(fn: (ev: ChangeEvent) => void): () => void;
  /** Used by commands and sessions to announce a change. The UI never calls this directly. */
  emit(ev: ChangeEvent): void;
}

export interface NewDocumentOptions {
  name: string;
  width: number;
  height: number;
  /** null = transparent background; otherwise a filled 'Background' raster layer is created. */
  background: RGBA | null;
}

// ---------------------------------------------------------------------------------------------
// History: command based, inverse tile patches
// ---------------------------------------------------------------------------------------------

export interface Command {
  /** Shown in the undo button tooltip and the History popover ('Brush', 'Add layer', ...). */
  label: string;
  do(doc: DocumentLike): void;
  undo(doc: DocumentLike): void;
  /**
   * Optional coalescing: when the history's top command is this one and `next` arrives within
   * MERGE_WINDOW_MS, merge returns true after folding next into this (used for slider scrubs,
   * typing, nudges). Default: no merge.
   */
  merge?(next: Command): boolean;
}

export interface HistoryLike {
  /** Executes cmd.do() then records it. Clears the redo stack. */
  push(cmd: Command): void;
  /** Records an already-applied command (raster sessions apply as they go). Clears the redo stack. */
  record(cmd: Command): void;
  undo(): boolean;
  redo(): boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Labels for the History popover, oldest first; `cursor` = how many are applied. */
  readonly labels: readonly string[];
  readonly cursor: number;
  /** Hard cap on retained steps (default 200). Oldest are dropped, their patches freed. */
  limit: number;
  subscribe(fn: () => void): () => void;
  clear(): void;
}

/** Commands are plain factories; the UI pushes them: doc.history.push(cmd.setProps(doc, id, { opacity: 0.5 })). */
export interface CommandFactory {
  /** Insert at parent.children[index] (index = children.length appends on top). */
  addNode(doc: DocumentLike, node: AnyNode, parentId: NodeId | null, index: number): Command;
  removeNodes(doc: DocumentLike, ids: NodeId[]): Command;
  /** Reorder / reparent. index refers to the new parent's children AFTER removal. */
  moveNode(doc: DocumentLike, id: NodeId, newParentId: NodeId | null, index: number): Command;
  /** Shallow prop patch on any node (name, visible, locked, opacity, blend, x, y, text props, shape props, expanded, maskEnabled). Mergeable when `mergeKey` is given and equal. */
  setProps(doc: DocumentLike, id: NodeId, patch: Partial<AnyNode>, mergeKey?: string): Command;
  /** Replace a node's mask (null removes). */
  setMask(doc: DocumentLike, id: NodeId, mask: Mask | null): Command;
  setSelection(doc: DocumentLike, sel: Selection | null): Command;
  /** Wraps ids (must share a parent) in a new group at the position of the topmost. */
  groupNodes(doc: DocumentLike, ids: NodeId[], name?: string): Command;
  /** Deep copy inserted directly above the source, named 'X copy'. */
  duplicateNode(doc: DocumentLike, id: NodeId): Command;
  /** Text/shape/group -> raster, preserving look, mask, opacity, blend. */
  rasterizeNode(doc: DocumentLike, id: NodeId): Command;
  /** Merge a raster/text/shape into the raster directly below it (both become one raster). */
  mergeDown(doc: DocumentLike, id: NodeId): Command;
  /** All visible layers -> one raster named 'Background'. */
  flatten(doc: DocumentLike): Command;
  /** Delete pixels inside the selection on a raster node (or clear the whole layer when no selection). */
  clearPixels(doc: DocumentLike, id: NodeId): Command;
  /** Rename document. */
  setDocumentName(doc: DocumentLike, name: string): Command;
  /** Group several commands into one undo step. */
  batch(label: string, cmds: Command[]): Command;

  // saved selections
  /** Stores a copy of doc.selection. */
  saveSelection(doc: DocumentLike, name: string): Command;
  deleteSavedSelection(doc: DocumentLike, id: string): Command;
  renameSavedSelection(doc: DocumentLike, id: string, name: string): Command;
  // guides (document space, undoable)
  addGuide(doc: DocumentLike, axis: 'h' | 'v', pos: number): Command;
  /** Mergeable per guide id. */
  moveGuide(doc: DocumentLike, id: string, pos: number): Command;
  removeGuide(doc: DocumentLike, id: string): Command;
  clearGuides(doc: DocumentLike): Command;
  // layer transforms
  /** Applies m (document space to document space) to each node. Raster: pixels and linked mask are resampled. Text and shape: affine m is composed into matrix/x/y (stays editable); a projective m throws Error('Rasterise this layer first'). Group: recurses. */
  transformNodes(doc: DocumentLike, ids: NodeId[], m: Mat3, interpolation: Interpolation): Command;
  /** Raster only. Bicubic patch warp of the node's pixels and linked mask. */
  warpNode(doc: DocumentLike, id: NodeId, grid: WarpGrid, interpolation: Interpolation): Command;
  /** Cuts the selected pixels of a raster node into a new raster node directly above it ('Layer via cut') or copies them ('Layer via copy'). The new node becomes active. */
  layerViaCut(doc: DocumentLike, id: NodeId): Command;
  layerViaCopy(doc: DocumentLike, id: NodeId): Command;
  /** Paints a band along the selection edge onto a raster node. */
  strokeSelection(doc: DocumentLike, id: NodeId, color: RGBA, width: number, position: 'inside' | 'center' | 'outside'): Command;
  // document transforms: all keep every layer, mask, text and shape (nothing flattens)
  /** New canvas size; (offsetX, offsetY) is where the old origin lands in the new canvas. deletePixels trims raster pixels that fall outside (crop with 'Delete cropped pixels'). Masks, selection, saved selections and guides follow. */
  resizeCanvas(doc: DocumentLike, width: number, height: number, offsetX: number, offsetY: number, opts?: { deletePixels?: boolean }): Command;
  /** Resamples the whole document to a new pixel size (every raster, mask, selection; text and shapes scale through their matrix; guides scale). */
  resizeImage(doc: DocumentLike, width: number, height: number, interpolation: Interpolation): Command;
  /** Rotates the whole document. Multiples of 90 are exact (no resampling loss). Other angles resample rasters; expand grows the canvas to fit. */
  rotateDocument(doc: DocumentLike, degrees: number, opts?: { interpolation?: Interpolation; expand?: boolean }): Command;
  flipDocument(doc: DocumentLike, axis: 'h' | 'v'): Command;
  /** Maps the quad (corners clockwise from top-left, document space) onto a new outW x outH canvas. Text and shape layers are rasterised by this command (the UI warns first). */
  perspectiveCrop(doc: DocumentLike, corners: [Point, Point, Point, Point], outW: number, outH: number, interpolation: Interpolation): Command;
  /** Crops to the bounds of non-transparent pixels ('transparent') or of pixels differing from the top-left / bottom-right colour. Returns null when nothing would change. */
  trimDocument(doc: DocumentLike, mode: 'transparent' | 'top-left' | 'bottom-right'): Command | null;
  /** Grows the canvas so that no layer content is clipped. Returns null when nothing is outside. */
  revealAll(doc: DocumentLike): Command | null;
  setDocumentDpi(doc: DocumentLike, dpi: number): Command;
}

/**
 * A raster edit session: tools write into `tiles` freely, the session remembers each touched
 * tile's "before" copy on first write (via markTile / write helpers) and produces one
 * command with inverse patches on commit. Pixels are already applied when commit is called,
 * so the caller uses history.record(cmd), not push.
 */
export interface RasterEditSession {
  readonly node: RasterNode;
  readonly tiles: TileStore;
  /** Call before writing into a tile obtained from tiles.get/getOrCreate so its before-state is captured. Idempotent. */
  markTile(tx: number, ty: number): Uint8ClampedArray;
  /** Convenience: marks every tile the node-space rect touches and returns the rect clamped to integers. */
  markRect(rect: Rect): Rect;
  /** Document-space union of everything marked so far (null when nothing). */
  dirtyBounds(): Rect | null;
  /** Emits a 'pixels' change for the rect (document space) so the compositor refreshes during a gesture. */
  flush(rect?: Rect): void;
  /** Returns the undoable command (already applied). After commit the session is dead. */
  commit(label: string): Command;
  /** Restores every marked tile to its before state and emits. */
  cancel(): void;
}

// ---------------------------------------------------------------------------------------------
// Compositor
// ---------------------------------------------------------------------------------------------

export interface CompositeOptions {
  /** Document-space rect to re-render; omit for the whole document. Implementations may render more. */
  dirty?: Rect;
}

export interface CompositorLike {
  readonly kind: 'gl' | 'cpu';
  /** Document-sized canvas holding the latest composite (straight alpha, transparent where nothing is painted). */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Resizes internal buffers when the document size changes. */
  resize(width: number, height: number): void;
  /** Composites doc.root bottom-to-top honouring visible, opacity, blend, mask, maskEnabled, group nesting (groups composite their children into a buffer, then blend that buffer with the group's own opacity/blend/mask). */
  composite(doc: DocumentLike, opts?: CompositeOptions): void;
  /** Reads back the composite (whole document when rect omitted). */
  readImageData(rect?: Rect): ImageData;
  /** Flat render of one node alone at document size (for thumbnails, eyedropper on a layer, rasterize). */
  renderNode(doc: DocumentLike, id: NodeId): ImageData;
  /** Live preview for transform gestures: the node (or group, or 'root') is drawn through the matrix or warp instead of in place. null clears. Nothing in the document changes. Must look the same as the committed result for affine matrices within resampling tolerance. */
  setPreview(preview: null | { nodeId: NodeId; matrix?: Mat3; warp?: WarpGrid; interpolation?: Interpolation }): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Selection building and mask painting (0.2.0)
// ---------------------------------------------------------------------------------------------

export interface QuickSelectLike {
  /** Grows the selection from a brush dab at p (document space) with the given radius. Call for every pointer sample. */
  stroke(p: Point, radius: number): void;
  /** Mask accumulated so far (document sized). Same object across calls. */
  readonly mask: Mask;
}

export interface MagneticLassoLike {
  /** First anchor. */
  start(p: Point): void;
  /** Edge-following path from the last anchor to p, for live display. Does not commit. */
  trace(p: Point): Point[];
  /** Commits the traced path up to p as fixed points (also called automatically every `frequency` pixels). */
  anchor(p: Point): void;
  /** Removes the last anchor (Backspace). */
  undoAnchor(): void;
  /** All committed points so far. */
  readonly points: readonly Point[];
  /** Closes the path back to the start along edges and returns the full polygon. */
  close(): Point[];
}

/** Painting into a layer mask. Mirrors RasterEditSession: mark, write, flush, commit one undoable command. */
export interface MaskEditSession {
  readonly nodeId: NodeId;
  readonly mask: Mask;
  /** Call before writing into mask.data inside the rect so the before-state is captured. */
  markRect(rect: Rect): Rect;
  flush(rect?: Rect): void;
  commit(label: string): Command;
  cancel(): void;
}

export interface WandOptions { tolerance: number; contiguous: boolean; antialias: boolean; sampleAllLayers: boolean; nodeId?: NodeId }

export interface ColorRangeOptions {
  /** 'sampled' uses `samples`; the others are fixed ranges. */
  range: 'sampled' | 'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas' | 'highlights' | 'midtones' | 'shadows';
  samples: RGBA[];
  /** 0..200, how far from the samples a colour may be and still be partly selected. */
  fuzziness: number;
  invert: boolean;
  /** Restrict to this selection when given. */
  within: Mask | null;
}

export interface RefineOptions {
  /** Edge detection band in pixels (0 = off): inside the band, coverage is recomputed from colour so hair and soft edges are kept. */
  radius: number;
  /** 0..100 */
  smooth: number;
  /** px, 0..250 */
  feather: number;
  /** 0..100 percent */
  contrast: number;
  /** -100..100 percent */
  shiftEdge: number;
}

// ---------------------------------------------------------------------------------------------
// Brush engine (stamp based), used by Brush and Eraser
// ---------------------------------------------------------------------------------------------

export interface BrushParams {
  /** Diameter in document pixels, 1..1000. */
  size: number;
  /** 0..1 (0 = fully soft, 1 = hard edge with 1 px antialiasing). */
  hardness: number;
  /** 0..1 maximum coverage a single stroke can reach. */
  opacity: number;
  /** 0..1 coverage each dab adds. */
  flow: number;
  /** Dab spacing as a fraction of size, 0.01..2 (default 0.1). */
  spacing: number;
  color: RGBA;
  pressureSize: boolean;
  pressureOpacity: boolean;
  mode: 'paint' | 'erase';
}

export interface StrokePoint {
  /** Document space. */
  x: number;
  y: number;
  /** 0..1; mouse reports 0.5. */
  pressure: number;
}

export interface BrushStrokeLike {
  begin(p: StrokePoint): void;
  move(p: StrokePoint): void;
  /** Finishes the stroke; the session now holds the final pixels. Returns the document-space dirty rect (null if nothing painted). */
  end(): Rect | null;
}

// ---------------------------------------------------------------------------------------------
// Persistence (IndexedDB) and autosave
// ---------------------------------------------------------------------------------------------

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

export interface AutosaveLike {
  /** Starts watching doc.history and node changes; writes dirty nodes/tiles after the debounce. */
  attach(doc: DocumentLike): void;
  detach(): void;
  /** Immediately writes everything pending (used before close / on pagehide). */
  flush(): Promise<void>;
  readonly state: SaveState;
  /** ms since epoch of the last successful write, 0 if never. */
  readonly savedAt: number;
  subscribe(fn: () => void): () => void;
}

export interface StoreLike {
  listDocuments(): Promise<DocumentMeta[]>;
  loadDocument(id: DocId): Promise<DocumentLike | null>;
  /** Full write of a document (meta, tree, every tile, masks, selection, thumbnail). */
  saveDocument(doc: DocumentLike): Promise<void>;
  deleteDocument(id: DocId): Promise<void>;
  /** Ids of documents that were open in the editor when the page was last unloaded, in tab order. */
  getOpenDocuments(): Promise<DocId[]>;
  setOpenDocuments(ids: DocId[]): Promise<void>;
  /** Generic small key/value for settings (theme, surround, last tool, recent commands). */
  getSetting<T>(key: string, fallback: T): Promise<T>;
  setSetting<T>(key: string, value: T): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------------------------

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportOptions {
  format: ExportFormat;
  /** 0.1..4; 1 = document size. */
  scale: number;
  /** 0..1, used by jpeg/webp only. */
  quality: number;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  /** Suggested filename, e.g. 'Poster.png'. */
  filename: string;
}

export interface ImportedImage {
  bitmap: ImageBitmap;
  name: string;
  width: number;
  height: number;
  /** Human notes about what was lost, e.g. 'GIF: first frame only'. */
  notes: string[];
}

export interface LossItem {
  /** Sentence case, e.g. '3 text layers will be rasterised'. */
  text: string;
}

// ---------------------------------------------------------------------------------------------
// Module-level functions the engine exports from '@/engine'
// ---------------------------------------------------------------------------------------------

export interface EngineApi {
  // document
  createDocument(opts: NewDocumentOptions): DocumentLike;
  /** Creates a Document from a bitmap: one raster layer named after the file. */
  documentFromBitmap(bitmap: ImageBitmap, name: string): DocumentLike;
  newId(): string;
  // nodes
  createRasterNode(name: string): RasterNode;
  createTextNode(name: string, props?: Partial<TextNode>): TextNode;
  createShapeNode(name: string, props?: Partial<ShapeNode>): ShapeNode;
  createGroupNode(name: string): GroupNode;
  createTileStore(): TileStore;
  // history
  commands: CommandFactory;
  beginRasterEdit(doc: DocumentLike, nodeId: NodeId): RasterEditSession;
  // compositor
  createCompositor(prefer?: 'auto' | 'gl' | 'cpu'): CompositorLike;
  // text & shape rasterisation (Canvas2D), node space
  measureText(node: TextNode): Rect;            // node-space bounds of the laid-out text
  rasterizeText(node: TextNode): ImageData | null;  // node space, null when empty
  rasterizeShape(node: ShapeNode): ImageData | null;
  // brush
  createBrushStroke(session: RasterEditSession, params: BrushParams, selection: Selection | null): BrushStrokeLike;
  // selection & masks (document space)
  createMask(w: number, h: number, fill?: number): Mask;
  rectMask(w: number, h: number, rect: Rect): Mask;
  ellipseMask(w: number, h: number, rect: Rect): Mask;
  combineMasks(a: Mask | null, b: Mask, op: 'replace' | 'add' | 'subtract' | 'intersect'): Mask;
  invertMask(m: Mask): Mask;
  maskBounds(m: Mask): Rect | null;
  /** Selection from mask, or null when the mask is empty. */
  selectionFromMask(m: Mask): Selection | null;
  selectAll(doc: DocumentLike): Selection;
  /** Pixel-edge outline of the mask for marching ants: flat array of segments [x1,y1,x2,y2,...] in document pixels. */
  maskOutline(m: Mask): Float32Array;
  /** Mask from a raster node's alpha (for 'mask from layer' and magic-select later). */
  maskFromAlpha(doc: DocumentLike, id: NodeId): Mask;
  // fill
  /** Contiguous or global flood fill at a document point on a raster node, tolerance 0..255, respecting the selection. Writes into the session. Returns dirty document rect. */
  floodFill(session: RasterEditSession, doc: DocumentLike, at: Point, color: RGBA, tolerance: number, contiguous: boolean): Rect | null;
  /** Fills the selection (or the whole document when none) with a colour on a raster node. */
  fillSelection(session: RasterEditSession, doc: DocumentLike, color: RGBA): Rect | null;
  // sampling
  /** Reads one pixel of the composite (or one node when nodeId given). Returns null outside the document. */
  samplePixel(compositor: CompositorLike, doc: DocumentLike, at: Point, nodeId?: NodeId): RGBA | null;
  // raster helpers used by tools and io
  /** New raster node from a bitmap placed at (x, y), named `name`. */
  rasterFromBitmap(bitmap: ImageBitmap | HTMLCanvasElement | ImageData, name: string, x?: number, y?: number): RasterNode;
  // persistence
  store: StoreLike;
  createAutosave(): AutosaveLike;
  // serialisation shared by IndexedDB and .photochop
  serializeDocument(doc: DocumentLike): Promise<SerializedDocument>;
  deserializeDocument(s: SerializedDocument): Promise<DocumentLike>;
  // utility
  colorToCss(c: RGBA): string;
  cssToColor(css: string): RGBA | null;

  // matrices
  mat3Identity(): Mat3;
  /** a after b: result maps p -> a(b(p)). */
  mat3Multiply(a: Mat3, b: Mat3): Mat3;
  mat3Translate(tx: number, ty: number): Mat3;
  mat3Scale(sx: number, sy: number, cx?: number, cy?: number): Mat3;
  mat3Rotate(degrees: number, cx?: number, cy?: number): Mat3;
  mat3Skew(degX: number, degY: number, cx?: number, cy?: number): Mat3;
  /** Projective matrix taking the rect's corners to the four destination points (clockwise from top-left). */
  mat3FromQuad(rect: Rect, to: [Point, Point, Point, Point]): Mat3;
  mat3Invert(m: Mat3): Mat3 | null;
  mat3Apply(m: Mat3, p: Point): Point;
  mat3IsAffine(m: Mat3): boolean;
  // selection building
  polygonMask(w: number, h: number, points: Point[], antialias: boolean): Mask;
  magicWand(compositor: CompositorLike, doc: DocumentLike, at: Point, opts: WandOptions): Mask;
  createQuickSelect(compositor: CompositorLike, doc: DocumentLike, opts: { sampleAllLayers: boolean; nodeId?: NodeId; tolerance: number }): QuickSelectLike;
  createMagneticLasso(compositor: CompositorLike, doc: DocumentLike, opts: { width: number; contrast: number; frequency: number }): MagneticLassoLike;
  colorRange(compositor: CompositorLike, doc: DocumentLike, opts: ColorRangeOptions): Mask;
  // selection modification (all return a new mask; soft coverage is preserved, never thresholded unless stated)
  /** True Gaussian, any radius up to 250. */
  featherMask(m: Mask, radius: number): Mask;
  /** Round structuring element. */
  expandMask(m: Mask, px: number): Mask;
  /** Image edges do not count as unselected. */
  contractMask(m: Mask, px: number): Mask;
  smoothMask(m: Mask, radius: number): Mask;
  /** Straddles the edge, width px in total. */
  borderMask(m: Mask, width: number): Mask;
  /** Contiguous, until stable. */
  growSelection(compositor: CompositorLike, doc: DocumentLike, m: Mask, tolerance: number): Mask;
  /** Whole document, against the set of selected colours. */
  similarSelection(compositor: CompositorLike, doc: DocumentLike, m: Mask, tolerance: number): Mask;
  refineMask(compositor: CompositorLike, doc: DocumentLike, m: Mask, opts: RefineOptions): Mask;
  transformMask(m: Mask, mat: Mat3, interpolation: Interpolation): Mask;
  // masks as paint targets
  beginMaskEdit(doc: DocumentLike, nodeId: NodeId): MaskEditSession;
  /** Brush or eraser into a mask: value 255 reveals, 0 hides, greys in between; honours size, hardness, opacity, flow, spacing, pressure and the selection. */
  createMaskStroke(session: MaskEditSession, params: BrushParams, value: number, selection: Selection | null): BrushStrokeLike;
  /** Bucket into a mask (at = null fills the selection or the whole mask). */
  fillMask(session: MaskEditSession, doc: DocumentLike, at: Point | null, value: number, tolerance: number, contiguous: boolean): Rect | null;
  // pixels
  /** Selection-clipped pixels of one node, or of the composite when nodeId is null (Copy merged). null when nothing is there. */
  copyPixels(compositor: CompositorLike, doc: DocumentLike, nodeId: NodeId | null): { image: ImageData; x: number; y: number } | null;
  // warp
  /** bend -100..100 */
  warpGridFor(bounds: Rect, preset: WarpPreset, bend: number): WarpGrid;
}

/** Framework-neutral serialized form. Blobs are PNG-encoded per raster node (lossless) plus masks. */
export interface SerializedDocument {
  json: SerializedDocumentJson;
  /** Keyed as in json: 'layer/<nodeId>' (RGBA PNG of the node's tile bounds), 'mask/<nodeId>' (grey PNG, document size), 'selection' (grey PNG), 'saved/<savedSelectionId>' (grey PNG, document size; format 2). */
  blobs: Record<string, Blob>;
}

/**
 * Format 1: 0.1.0 files and autosaves (no dpi, guides, saved selections or node matrices).
 * Format 2: 0.2.0 and later. Readers accept both and default what format 1 lacks
 * (dpi 72, no guides, no saved selections, identity matrices); anything higher is rejected.
 */
export interface SerializedDocumentJson {
  app: string;          // APP_NAME
  version: string;      // APP_VERSION that wrote the file
  format: 1 | 2;        // file format revision
  id: DocId;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  activeId: NodeId | null;
  root: SerializedNode;
  selectionBounds: Rect | null;
  /** Format 2. Missing on read means 72. */
  dpi?: number;
  /** Format 2. Missing on read means none. */
  guides?: Guide[];
  /** Format 2. Mask bytes live in blobs under 'saved/<id>'. Missing on read means none. */
  savedSelections?: Array<{ id: string; name: string }>;
}

/** Text and shape nodes carry `matrix` (format 2); format 1 files lack it and readers default it to identity. */
export type SerializedNode =
  | (Omit<RasterNode, 'tiles' | 'mask'> & { mask: boolean; bounds: Rect | null })
  | (Omit<TextNode, 'mask'> & { mask: boolean })
  | (Omit<ShapeNode, 'mask'> & { mask: boolean })
  | (Omit<GroupNode, 'children' | 'mask'> & { mask: boolean; children: SerializedNode[] });

/** Functions '@/io' exports. */
export interface IoApi {
  /** Accepts PNG, JPEG, WebP, GIF (first frame), BMP, SVG. Rejects anything else with a readable Error. */
  importImageFile(file: File | Blob, name?: string): Promise<ImportedImage>;
  /** Which of these files look like images or .photochop projects (by extension or MIME). */
  classifyFiles(files: FileList | File[]): { images: File[]; projects: File[]; other: File[] };
  /** Renders the composite at scale and encodes. */
  exportImage(doc: DocumentLike, compositor: CompositorLike, opts: ExportOptions): Promise<ExportResult>;
  /** What the user loses with this format, in display order: transparency (jpeg), text layers rasterised, shape layers rasterised, N layers flattened, masks baked, selection not saved, live effects flattened (always 0 in 0.1.0 and omitted). Empty for the project format. */
  lossList(doc: DocumentLike, format: ExportFormat | 'photochop'): LossItem[];
  /** Rough encoded size in bytes for the status line ('about 1.2 MB'); may encode once at a smaller scale. */
  estimateSize(doc: DocumentLike, compositor: CompositorLike, opts: ExportOptions): Promise<number>;
  /** .photochop = ZIP (fflate) with document.json + layers/*.png + masks/*.png + thumbnail.png. */
  saveProject(doc: DocumentLike, compositor: CompositorLike): Promise<Blob>;
  openProject(blob: Blob): Promise<DocumentLike>;
  /** Triggers a browser download. */
  downloadBlob(blob: Blob, filename: string): void;
  /** File System Access API when present (showSaveFilePicker), else downloadBlob. Resolves to the handle or null. */
  saveAs(blob: Blob, filename: string, description: string, accept: Record<string, string[]>): Promise<FileSystemFileHandle | null>;
  /** The selection as a greyscale PNG at document size. */
  exportSelection(doc: DocumentLike): Promise<Blob>;
  /** Any image as a selection mask (luminance times alpha), scaled to the document when sizes differ. */
  importSelection(file: File | Blob, doc: DocumentLike): Promise<Mask>;
  /** Writes an image to the system clipboard as PNG. false when the browser refuses. */
  copyImageToClipboard(image: ImageData): Promise<boolean>;
}

// Re-export the types the UI needs most, so '@/engine' is the only import.
export type {
  AnyNode, BlendMode, ChangeEvent, DocId, DocumentMeta, GroupNode, Guide, Interpolation, Mask, Mat3,
  NodeId, Point, RGBA, RasterNode, Rect, SavedSelection, Selection, ShapeNode, TextNode, TileStore,
  WarpGrid, WarpPreset,
};
