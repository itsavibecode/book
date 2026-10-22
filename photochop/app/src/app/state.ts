// The app store. Signals hold UI state; engine objects (documents, compositors, autosaves) are
// kept as plain references inside DocTab so signals never try to track their internals. When
// a document changes, `docVersion` is bumped (at most once per frame) and components that read
// it re-render and pull fresh values from the engine objects.
import { computed, signal } from '@preact/signals';
import type { AutosaveLike, CompositorLike, DocumentLike, NodeId, Point, RGBA } from '@/engine';
import { DEFAULT_TOOL_OPTIONS, type ToolOptions } from '@/tools/options';
import type { GroupId, ToolId } from '@/tools/registry';

export interface View {
  /** 1 = 100% */
  zoom: number;
  /** Screen position (CSS px, relative to the viewport) of document pixel (0, 0). */
  panX: number;
  panY: number;
}

export interface DocTab {
  /** Stable UI key (documents can share names). */
  key: number;
  doc: DocumentLike;
  compositor: CompositorLike;
  autosave: AutosaveLike;
  view: View;
  /** True until the viewport has fitted the document once. */
  needsFit: boolean;
  /** True while the view is the automatic Fit; a pane resize then refits. Manual zoom or pan clears it. */
  autoFit: boolean;
  /** File handle from the last 'Save project' when the File System Access API is present. */
  fileHandle: FileSystemFileHandle | null;
  unsubs: Array<() => void>;
}

// ---- documents --------------------------------------------------------------------------------
export const documents = signal<DocTab[]>([]);
export const activeDocIndex = signal(-1);
export const activeTab = computed<DocTab | null>(() => documents.value[activeDocIndex.value] ?? null);
/** Bumped whenever any open document, its history or its selection changes. */
export const docVersion = signal(0);
/** Bumped when an autosave state changes. */
export const saveVersion = signal(0);
/** Bumped when the active view (zoom / pan) changes. */
export const viewVersion = signal(0);
/** True once boot finished deciding between the start screen and the editor. */
export const booted = signal(false);
/** Set when the engine failed to start (shown on the start screen instead of crashing). */
export const engineError = signal<string | null>(null);

// ---- tools ------------------------------------------------------------------------------------
export const toolGroup = signal<GroupId>('brush');
export const groupMember = signal<Partial<Record<GroupId, ToolId>>>({});
export const toolId = computed<ToolId>(() => groupMember.value[toolGroup.value] ?? defaultToolFor(toolGroup.value));
export const toolOptions = signal<ToolOptions>(structuredClone(DEFAULT_TOOL_OPTIONS));
/** True while a pointer gesture is in progress on the canvas (thumbnails wait until it ends). */
export const gestureActive = signal(false);

function defaultToolFor(g: GroupId): ToolId {
  const map: Record<GroupId, ToolId> = {
    move: 'move', select: 'selectRect', lasso: 'move', magic: 'move', crop: 'move', brush: 'brush', eraser: 'eraser',
    fill: 'fill', retouch: 'move', text: 'text', shape: 'shapeRect', pen: 'move', view: 'hand',
  };
  return map[g];
}

// ---- colours ----------------------------------------------------------------------------------
export const foreground = signal<RGBA>([0, 0, 0, 255]);
export const background = signal<RGBA>([255, 255, 255, 255]);
export const recentColours = signal<RGBA[]>([]);

// ---- appearance -------------------------------------------------------------------------------
export type ThemePref = 'system' | 'light' | 'dark';
export const theme = signal<ThemePref>('system');
/** The theme actually applied after resolving 'system'. */
export const resolvedTheme = signal<'light' | 'dark'>('dark');
export type SurroundKind = 'light' | 'mid' | 'dark' | 'custom';
export const surround = signal<{ kind: SurroundKind; custom: string }>({ kind: 'mid', custom: '#5a5a60' });
export const pixelGrid = signal(true);
export const compact = signal(false);
export const panelVisible = signal(true);
/** Height share of the Layers list in the right panel, 0.2..0.8. */
export const panelSplit = signal(0.55);

// ---- transient UI -----------------------------------------------------------------------------
export const paletteOpen = signal(false);
export const paletteQuery = signal('');
export type SheetState = 'collapsed' | 'half' | 'full';
export const sheetState = signal<SheetState>('collapsed');
/**
 * What the colour popover edits: the foreground / background swatch, the stroke colour used for
 * new shapes, or one colour property of one layer (pushed as mergeable setProps on that node only).
 * `anchor` is the viewport rect of the control that opened it (the popover sits next to it).
 */
export type ColourTarget =
  | { which: 'fg' | 'bg' | 'strokeOption'; anchor?: AnchorRect }
  | { which: 'node'; nodeId: NodeId; prop: 'fill' | 'stroke' | 'color'; anchor?: AnchorRect };
export interface AnchorRect { left: number; top: number; right: number; bottom: number }
export const colourPopover = signal<ColourTarget | null>(null);
/** Document-space pointer position for the status bar, null when outside. */
export const pointerDoc = signal<Point | null>(null);
/** Text tool editing state. `nodeId` is null until the first character creates the layer. */
export const textEdit = signal<null | { tabKey: number; nodeId: NodeId | null; at: Point; mergeKey: string }>(null);
/** Inline rename request for the Layers panel (F2). */
export const renameRequest = signal<NodeId | null>(null);
/** Ticks every second while something shows relative times. */
export const now = signal(Date.now());

export interface Toast { id: number; text: string; tone?: 'info' | 'error' }
export const toasts = signal<Toast[]>([]);

export type ModalSpec =
  | { kind: 'newdoc' }
  | { kind: 'export' }
  | { kind: 'settings' }
  | { kind: 'about' }
  | { kind: 'network' }
  | {
      kind: 'confirm'; title: string; body: string; confirmLabel: string; cancelLabel?: string;
      danger?: boolean; resolve: (ok: boolean) => void;
    };
/** Stack: the last entry is on top and owns focus. */
export const modals = signal<ModalSpec[]>([]);

// ---- network log ------------------------------------------------------------------------------
export interface NetEntry { url: string; origin: string; path: string; type: string; method: string; bytes: number; time: number; crossOrigin: boolean }
export const networkLog = signal<NetEntry[]>([]);
export const networkCount = computed(() => networkLog.value.length);
export const crossOriginCount = computed(() => networkLog.value.filter((e) => e.crossOrigin).length);

// ---- helpers ----------------------------------------------------------------------------------
let toastId = 0;
export function toast(text: string, tone: Toast['tone'] = 'info'): void {
  const t: Toast = { id: ++toastId, text, tone };
  toasts.value = [...toasts.value, t].slice(-3);
  setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== t.id); }, 3000);
}

export function openModal(m: ModalSpec): void {
  modals.value = [...modals.value.filter((x) => x.kind !== m.kind || m.kind === 'confirm'), m];
}

export function closeModal(kind: ModalSpec['kind']): void {
  const list = modals.value.slice();
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].kind === kind) { list.splice(i, 1); break; }
  }
  modals.value = list;
}

export function isModalOpen(kind: ModalSpec['kind']): boolean {
  return modals.value.some((m) => m.kind === kind);
}

/** Decision modal. Resolves true on confirm, false on Cancel / X / Esc. */
export function confirmModal(opts: { title: string; body: string; confirmLabel: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const spec: ModalSpec = {
      kind: 'confirm', ...opts,
      resolve: (ok) => { modals.value = modals.value.filter((m) => m !== spec); resolve(ok); },
    };
    modals.value = [...modals.value, spec];
  });
}

/** Mutates the active tab's view and notifies listeners. */
export function setView(tab: DocTab, v: Partial<View>): void {
  Object.assign(tab.view, v);
  viewVersion.value++;
}

let bumpQueued = false;
/** Batches document change notifications to one per animation frame. */
export function bumpDoc(): void {
  if (bumpQueued) return;
  bumpQueued = true;
  requestAnimationFrame(() => { bumpQueued = false; docVersion.value++; });
}

/** Immediate bump, for state the UI changes itself (active layer, selection in the panel). */
export function bumpDocNow(): void {
  docVersion.value++;
}
