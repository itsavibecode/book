// Debounced autosave. Writes the whole document each time but re-encodes only rasters and masks
// that changed since the last successful write; clean ones keep their stored blob.
import { AUTOSAVE_DEBOUNCE_MS } from '@/app/constants';
import type { AutosaveLike, DocumentLike, SaveState } from './contract';
import type { AnyNode, ChangeEvent, Mask, NodeId, Selection, TileStore } from './types';
import { readMeta, saveDocumentWith } from './store';

/** Rebuilding the Recent-grid thumbnail needs a full CPU composite, so it is throttled. */
const THUMB_INTERVAL_MS = 10_000;

function walk(nodes: AnyNode[], fn: (n: AnyNode) => void): void {
  for (const n of nodes) {
    fn(n);
    if (n.type === 'group') walk(n.children, fn);
  }
}

interface Written {
  tiles: Map<NodeId, TileStore>;
  masks: Map<NodeId, Mask>;
  selection: Selection | null | undefined;
}

class Autosave implements AutosaveLike {
  private _state: SaveState = 'saved';
  private _savedAt = 0;
  private listeners = new Set<() => void>();
  private doc: DocumentLike | null = null;
  private unsub: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private pending = false;
  private gen = 0;
  private written: Written = { tiles: new Map(), masks: new Map(), selection: undefined };
  private dirtyLayers = new Set<NodeId>();
  private dirtyMasks = new Set<NodeId>();
  private selectionDirty = true;
  private thumb: string | undefined;
  private thumbAt = 0;
  private persisted = false;
  /** Settles once attach() has decided whether the document is already stored. */
  private ready: Promise<void> = Promise.resolve();

  get state(): SaveState {
    return this._state;
  }

  get savedAt(): number {
    return this._savedAt;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  attach(doc: DocumentLike): void {
    this.detach();
    this.doc = doc;
    this.written = { tiles: new Map(), masks: new Map(), selection: undefined };
    this.dirtyLayers.clear();
    this.dirtyMasks.clear();
    this.selectionDirty = true;
    this.thumb = undefined;
    this.thumbAt = 0;
    this.pending = false;
    this.unsub = doc.subscribe((ev) => this.onChange(ev));
    const gen = ++this.gen;
    // A document loaded from this store at this exact version is already saved; anything else
    // (new, imported, opened from a file) gets a first full write.
    this.ready = readMeta(doc.id).then((meta) => {
      if (gen !== this.gen || this.pending) return;
      if (meta && meta.updatedAt === doc.updatedAt) {
        this.seedWritten(doc);
        this.thumb = meta.thumbnail;
        this.thumbAt = Date.now();
        this._savedAt = meta.updatedAt;
        this.setState('saved');
      } else {
        this.markPending();
      }
    }, () => {
      if (gen === this.gen) this.markPending();
    });
  }

  detach(): void {
    this.gen++;
    this.unsub?.();
    this.unsub = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.doc = null;
  }

  async flush(): Promise<void> {
    await this.ready;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.run();
    // One more pass picks up edits made while the first write was in flight.
    if (this.pending) await this.run();
  }

  private setState(s: SaveState): void {
    if (this._state === s) return;
    this._state = s;
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
  }

  private seedWritten(doc: DocumentLike): void {
    walk(doc.root.children, (n) => {
      if (n.type === 'raster') this.written.tiles.set(n.id, n.tiles);
      if (n.mask) this.written.masks.set(n.id, n.mask);
    });
    this.written.selection = doc.selection;
    this.selectionDirty = false;
  }

  private onChange(ev: ChangeEvent): void {
    if (ev.kind === 'pixels') this.dirtyLayers.add(ev.nodeId);
    else if (ev.kind === 'node') this.dirtyMasks.add(ev.nodeId);
    else if (ev.kind === 'selection') this.selectionDirty = true;
    this.markPending();
  }

  private markPending(): void {
    this.pending = true;
    this.setState('dirty');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    while (this.inflight) await this.inflight;
    const doc = this.doc;
    if (!this.pending || !doc) return;
    this.pending = false;
    this.setState('saving');

    const skipLayers = new Set<NodeId>();
    const skipMasks = new Set<NodeId>();
    const tilesNow = new Map<NodeId, TileStore>();
    const masksNow = new Map<NodeId, Mask>();
    walk(doc.root.children, (n) => {
      if (n.type === 'raster') {
        tilesNow.set(n.id, n.tiles);
        if (this.written.tiles.get(n.id) === n.tiles && !this.dirtyLayers.has(n.id)) skipLayers.add(n.id);
      }
      if (n.mask) {
        masksNow.set(n.id, n.mask);
        if (this.written.masks.get(n.id) === n.mask && !this.dirtyMasks.has(n.id)) skipMasks.add(n.id);
      }
    });
    const selectionNow = doc.selection;
    const skipSelection = !this.selectionDirty && this.written.selection === selectionNow;
    const dirtyLayers = new Set(this.dirtyLayers);
    const dirtyMasks = new Set(this.dirtyMasks);
    const selectionWasDirty = this.selectionDirty;
    this.dirtyLayers.clear();
    this.dirtyMasks.clear();
    this.selectionDirty = false;

    const now = Date.now();
    const buildThumbnail = !this.thumb || now - this.thumbAt >= THUMB_INTERVAL_MS;
    const job = saveDocumentWith(doc, {
      skip: { layers: skipLayers, masks: skipMasks, selection: skipSelection },
      thumbnail: this.thumb,
      buildThumbnail,
    }).then((meta) => {
      if (doc !== this.doc) return;
      this.written = { tiles: tilesNow, masks: masksNow, selection: selectionNow };
      if (buildThumbnail) {
        this.thumb = meta.thumbnail;
        this.thumbAt = now;
      }
      this._savedAt = Date.now();
      if (!this.persisted) {
        this.persisted = true;
        try {
          void navigator.storage?.persist?.().catch(() => undefined);
        } catch {
          // Storage persistence is a best-effort request.
        }
      }
      this.setState(this.pending ? 'dirty' : 'saved');
    }, (err: unknown) => {
      console.error(err);
      if (doc !== this.doc) return;
      for (const id of dirtyLayers) this.dirtyLayers.add(id);
      for (const id of dirtyMasks) this.dirtyMasks.add(id);
      if (selectionWasDirty) this.selectionDirty = true;
      // Nothing from this attempt counts as written; force full blobs next time.
      this.written = { tiles: new Map(), masks: new Map(), selection: undefined };
      this.pending = true;
      this.setState('error');
    });
    this.inflight = job;
    try {
      await job;
    } finally {
      this.inflight = null;
    }
  }
}

export function createAutosave(): AutosaveLike {
  return new Autosave();
}
