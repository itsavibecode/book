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
  AnyNode, BlendMode, ChangeEvent, DocId, DocumentMeta, GroupNode, Mask, NodeId, Point, RGBA,
  RasterNode, Rect, Selection, ShapeNode, TextNode, TileStore,
} from './types';

// ---------------------------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------------------------

export interface DocumentLike {
  readonly id: DocId;
  name: string;
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
  dispose(): void;
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
  // serialisation shared by IndexedDB and .strata
  serializeDocument(doc: DocumentLike): Promise<SerializedDocument>;
  deserializeDocument(s: SerializedDocument): Promise<DocumentLike>;
  // utility
  colorToCss(c: RGBA): string;
  cssToColor(css: string): RGBA | null;
}

/** Framework-neutral serialized form. Blobs are PNG-encoded per raster node (lossless) plus masks. */
export interface SerializedDocument {
  json: SerializedDocumentJson;
  /** Keyed as in json: 'layer/<nodeId>' (RGBA PNG of the node's tile bounds), 'mask/<nodeId>' (grey PNG, document size), 'selection' (grey PNG). */
  blobs: Record<string, Blob>;
}

export interface SerializedDocumentJson {
  app: string;          // APP_NAME
  version: string;      // APP_VERSION that wrote the file
  format: 1;            // file format revision
  id: DocId;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  activeId: NodeId | null;
  root: SerializedNode;
  selectionBounds: Rect | null;
}

export type SerializedNode =
  | (Omit<RasterNode, 'tiles' | 'mask'> & { mask: boolean; bounds: Rect | null })
  | (Omit<TextNode, 'mask'> & { mask: boolean })
  | (Omit<ShapeNode, 'mask'> & { mask: boolean })
  | (Omit<GroupNode, 'children' | 'mask'> & { mask: boolean; children: SerializedNode[] });

/** Functions '@/io' exports. */
export interface IoApi {
  /** Accepts PNG, JPEG, WebP, GIF (first frame), BMP, SVG. Rejects anything else with a readable Error. */
  importImageFile(file: File | Blob, name?: string): Promise<ImportedImage>;
  /** Which of these files look like images or .strata projects (by extension or MIME). */
  classifyFiles(files: FileList | File[]): { images: File[]; projects: File[]; other: File[] };
  /** Renders the composite at scale and encodes. */
  exportImage(doc: DocumentLike, compositor: CompositorLike, opts: ExportOptions): Promise<ExportResult>;
  /** What the user loses with this format, in display order: transparency (jpeg), text layers rasterised, shape layers rasterised, N layers flattened, masks baked, selection not saved, live effects flattened (always 0 in 0.1.0 and omitted). Empty for the project format. */
  lossList(doc: DocumentLike, format: ExportFormat | 'strata'): LossItem[];
  /** Rough encoded size in bytes for the status line ('about 1.2 MB'); may encode once at a smaller scale. */
  estimateSize(doc: DocumentLike, compositor: CompositorLike, opts: ExportOptions): Promise<number>;
  /** .strata = ZIP (fflate) with document.json + layers/*.png + masks/*.png + thumbnail.png. */
  saveStrata(doc: DocumentLike, compositor: CompositorLike): Promise<Blob>;
  openStrata(blob: Blob): Promise<DocumentLike>;
  /** Triggers a browser download. */
  downloadBlob(blob: Blob, filename: string): void;
  /** File System Access API when present (showSaveFilePicker), else downloadBlob. Resolves to the handle or null. */
  saveAs(blob: Blob, filename: string, description: string, accept: Record<string, string[]>): Promise<FileSystemFileHandle | null>;
}

// Re-export the types the UI needs most, so '@/engine' is the only import.
export type {
  AnyNode, BlendMode, ChangeEvent, DocId, DocumentMeta, GroupNode, Mask, NodeId, Point, RGBA,
  RasterNode, Rect, Selection, ShapeNode, TextNode, TileStore,
};
