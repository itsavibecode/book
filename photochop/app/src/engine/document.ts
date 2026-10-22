// The live document: a node tree plus selection, active layer and history.
import type { DocumentLike, HistoryLike, NewDocumentOptions } from './contract';
import type {
  AnyNode, ChangeEvent, DocId, GroupNode, Mask, NodeBase, NodeId, NodeType, RasterNode, Rect,
  Selection, ShapeNode, TextNode,
} from './types';
import { createTileStore, fillTilesRect } from './tiles';
import { History } from './history';
import { measureText } from './text';
import { shapeBounds } from './shape';
import { rectUnion } from './util';

export const ROOT_ID = 'root';

export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const hex: string[] = [];
  for (let i = 0; i < 32; i++) hex.push(Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function base(type: NodeType, name: string): NodeBase {
  return {
    id: newId(), type, name, visible: true, locked: false, opacity: 1, blend: 'normal',
    x: 0, y: 0, mask: null, maskEnabled: true, effects: [],
  };
}

export function createRasterNode(name: string): RasterNode {
  return { ...base('raster', name), type: 'raster', tiles: createTileStore() };
}

export function createTextNode(name: string, props: Partial<TextNode> = {}): TextNode {
  const n: TextNode = {
    ...base('text', name),
    text: '', font: 'system-ui', size: 48, weight: 700, italic: false, color: [0, 0, 0, 255],
    align: 'left', lineHeight: 1.2, letterSpacing: 0, width: null,
    ...props,
    type: 'text',
  };
  n.color = [...n.color];
  return n;
}

export function createShapeNode(name: string, props: Partial<ShapeNode> = {}): ShapeNode {
  const n: ShapeNode = {
    ...base('shape', name),
    shape: 'rect', w: 100, h: 100, radius: 0, fill: [0, 0, 0, 255], stroke: null, strokeWidth: 2,
    ...props,
    type: 'shape',
  };
  if (n.fill) n.fill = [...n.fill];
  if (n.stroke) n.stroke = [...n.stroke];
  return n;
}

export function createGroupNode(name: string): GroupNode {
  return { ...base('group', name), type: 'group', children: [], expanded: true };
}

export function cloneMask(m: Mask | null): Mask | null {
  return m ? { w: m.w, h: m.h, data: m.data.slice() } : null;
}

interface DocInit {
  id?: DocId;
  name: string;
  width: number;
  height: number;
  createdAt?: number;
  updatedAt?: number;
}

export class Document implements DocumentLike {
  readonly id: DocId;
  name: string;
  readonly width: number;
  readonly height: number;
  readonly root: GroupNode;
  selection: Selection | null = null;
  activeId: NodeId | null = null;
  selectedIds: NodeId[] = [];
  readonly history: HistoryLike;
  readonly createdAt: number;
  updatedAt: number;
  private _version = 0;
  private listeners = new Set<(ev: ChangeEvent) => void>();

  constructor(init: DocInit) {
    this.id = init.id ?? newId();
    this.name = init.name;
    this.width = Math.max(1, Math.round(init.width));
    this.height = Math.max(1, Math.round(init.height));
    const now = Date.now();
    this.createdAt = init.createdAt ?? now;
    this.updatedAt = init.updatedAt ?? now;
    this.root = { ...createGroupNode('Root'), id: ROOT_ID };
    this.history = new History(this);
  }

  get version(): number {
    return this._version;
  }

  getNode(id: NodeId): AnyNode | undefined {
    return find(this.root.children, id);
  }

  parentOf(id: NodeId): GroupNode | undefined {
    return findParent(this.root, id);
  }

  indexOf(id: NodeId): number {
    const p = this.parentOf(id);
    return p ? p.children.findIndex((c) => c.id === id) : -1;
  }

  flatten(): Array<{ node: AnyNode; depth: number; parent: GroupNode }> {
    const out: Array<{ node: AnyNode; depth: number; parent: GroupNode }> = [];
    const walk = (g: GroupNode, depth: number) => {
      for (let i = g.children.length - 1; i >= 0; i--) {
        const node = g.children[i];
        out.push({ node, depth, parent: g });
        if (node.type === 'group') walk(node, depth + 1);
      }
    };
    walk(this.root, 0);
    return out;
  }

  activeNode(): AnyNode | undefined {
    return this.activeId ? this.getNode(this.activeId) : undefined;
  }

  nodeBounds(id: NodeId): Rect | null {
    const n = this.getNode(id);
    return n ? nodeDocBounds(n) : null;
  }

  subscribe(fn: (ev: ChangeEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  emit(ev: ChangeEvent): void {
    this._version++;
    this.updatedAt = Date.now();
    for (const fn of [...this.listeners]) {
      try {
        fn(ev);
      } catch (err) {
        // One faulty listener must not stop the others (compositor, autosave, panels).
        console.error(err);
      }
    }
  }
}

function find(children: AnyNode[], id: NodeId): AnyNode | undefined {
  for (const c of children) {
    if (c.id === id) return c;
    if (c.type === 'group') {
      const f = find(c.children, id);
      if (f) return f;
    }
  }
  return undefined;
}

function findParent(g: GroupNode, id: NodeId): GroupNode | undefined {
  for (const c of g.children) {
    if (c.id === id) return g;
    if (c.type === 'group') {
      const f = findParent(c, id);
      if (f) return f;
    }
  }
  return undefined;
}

/** Document-space content bounds; null when the node has no content. */
export function nodeDocBounds(n: AnyNode): Rect | null {
  switch (n.type) {
    case 'raster': {
      const b = n.tiles.bounds();
      return b ? { x: b.x + Math.round(n.x), y: b.y + Math.round(n.y), w: b.w, h: b.h } : null;
    }
    case 'text': {
      if (n.text.trim() === '' && n.width === null) return null;
      const b = measureText(n);
      return b.w > 0 && b.h > 0 ? { x: b.x + Math.round(n.x), y: b.y + Math.round(n.y), w: b.w, h: b.h } : null;
    }
    case 'shape': {
      if (n.w === 0 || n.h === 0) return null;
      const b = shapeBounds(n);
      return { x: b.x + Math.round(n.x), y: b.y + Math.round(n.y), w: b.w, h: b.h };
    }
    case 'group': {
      let r: Rect | null = null;
      for (const c of n.children) r = rectUnion(r, nodeDocBounds(c));
      return r;
    }
  }
}

export function createDocument(opts: NewDocumentOptions): DocumentLike {
  const doc = new Document({ name: opts.name, width: opts.width, height: opts.height });
  if (opts.background) {
    const bg = createRasterNode('Background');
    fillTilesRect(bg.tiles, { x: 0, y: 0, w: doc.width, h: doc.height }, opts.background);
    if (opts.background[3] === 0) bg.tiles.prune();
    doc.root.children.push(bg);
    doc.activeId = bg.id;
    doc.selectedIds = [bg.id];
  }
  return doc;
}
