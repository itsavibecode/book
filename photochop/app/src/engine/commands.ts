// Undoable commands for the document tree, props, masks and selection. Raster-producing
// commands (rasterise, merge down, flatten, clear) live in commands-raster.ts.
import type { Command, CommandFactory, DocumentLike } from './contract';
import type { AnyNode, GroupNode, Mask, NodeId, Selection } from './types';
import { cloneMask, createGroupNode, newId } from './document';
import { clearPixels, flattenDocument, mergeDown, rasterizeNode } from './commands-raster';
import { requireNode, restoreActive, setActive, snapshotActive, type ActiveState } from './command-util';

function parentFor(doc: DocumentLike, parentId: NodeId | null): GroupNode {
  if (parentId === null || parentId === doc.root.id) return doc.root;
  const p = doc.getNode(parentId);
  if (!p || p.type !== 'group') throw new Error('Layers can only be placed inside a group');
  return p;
}

function isInside(node: AnyNode, target: GroupNode): boolean {
  if (node === target) return true;
  if (node.type !== 'group') return false;
  return node.children.some((c) => isInside(c, target));
}

function clampIndex(i: number, len: number): number {
  return Math.max(0, Math.min(len, Math.round(i)));
}

export function cloneNode(n: AnyNode, rename = true): AnyNode {
  const name = rename ? `${n.name} copy` : n.name;
  const common = { id: newId(), name, mask: cloneMask(n.mask), effects: [...n.effects] };
  switch (n.type) {
    case 'raster': return { ...n, ...common, tiles: n.tiles.clone() };
    case 'text': return { ...n, ...common, color: [...n.color] };
    case 'shape': return { ...n, ...common, fill: n.fill ? [...n.fill] : null, stroke: n.stroke ? [...n.stroke] : null };
    case 'group': return { ...n, ...common, children: n.children.map((c) => cloneNode(c, false)) };
  }
}

const SKIP_KEYS = new Set(['id', 'type', 'children', 'tiles', 'mask']);

function copyValue(v: unknown): unknown {
  return Array.isArray(v) ? [...v] : v;
}

function labelForPatch(keys: string[]): string {
  if (keys.length === 1) {
    switch (keys[0]) {
      case 'name': return 'Rename layer';
      case 'visible': return 'Layer visibility';
      case 'locked': return 'Lock layer';
      case 'opacity': return 'Layer opacity';
      case 'blend': return 'Blend mode';
      case 'expanded': return 'Expand group';
      case 'maskEnabled': return 'Mask on or off';
    }
  }
  if (keys.every((k) => k === 'x' || k === 'y')) return 'Move layer';
  if (keys.some((k) => ['text', 'font', 'size', 'weight', 'italic', 'color', 'align', 'lineHeight', 'letterSpacing', 'width'].includes(k))) return 'Edit text';
  if (keys.some((k) => ['w', 'h', 'radius', 'fill', 'stroke', 'strokeWidth', 'shape'].includes(k))) return 'Edit shape';
  return 'Layer properties';
}

class SetPropsCommand implements Command {
  readonly label: string;
  private before: Record<string, unknown> | null = null;
  private after: Record<string, unknown>;

  constructor(readonly nodeId: NodeId, patch: Record<string, unknown>, readonly mergeKey?: string) {
    this.after = {};
    for (const [k, v] of Object.entries(patch)) if (!SKIP_KEYS.has(k) && v !== undefined) this.after[k] = copyValue(v);
    this.label = labelForPatch(Object.keys(this.after));
  }

  do(doc: DocumentLike): void {
    const n = requireNode(doc, this.nodeId) as unknown as Record<string, unknown>;
    if (!this.before) {
      this.before = {};
      for (const k of Object.keys(this.after)) this.before[k] = copyValue(n[k]);
    }
    for (const [k, v] of Object.entries(this.after)) n[k] = copyValue(v);
    doc.emit({ kind: 'node', nodeId: this.nodeId });
  }

  undo(doc: DocumentLike): void {
    const n = requireNode(doc, this.nodeId) as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(this.before ?? {})) n[k] = copyValue(v);
    doc.emit({ kind: 'node', nodeId: this.nodeId });
  }

  merge(next: Command): boolean {
    if (!(next instanceof SetPropsCommand) || !this.mergeKey || next.mergeKey !== this.mergeKey || next.nodeId !== this.nodeId) return false;
    if (!this.before) return false;
    // Keep the oldest before-state for each key and the newest after-state.
    for (const [k, v] of Object.entries(next.before ?? {})) if (!(k in this.before)) this.before[k] = v;
    this.after = { ...this.after, ...next.after };
    return true;
  }
}

// ----- the factory -----

export const commands: CommandFactory = {
  addNode(_doc, node, parentId, index) {
    let act: ActiveState | null = null;
    return {
      label: node.type === 'group' ? 'Add group' : node.type === 'text' ? 'Add text' : node.type === 'shape' ? 'Add shape' : 'Add layer',
      do(d) {
        const parent = parentFor(d, parentId);
        act = snapshotActive(d);
        parent.children.splice(clampIndex(index, parent.children.length), 0, node);
        d.emit({ kind: 'tree' });
        setActive(d, node.id);
      },
      undo(d) {
        const parent = d.parentOf(node.id);
        if (parent) parent.children.splice(parent.children.indexOf(node), 1);
        d.emit({ kind: 'tree' });
        if (act) restoreActive(d, act);
      },
    };
  },

  removeNodes(_doc, ids) {
    let removed: Array<{ node: AnyNode; parent: GroupNode; index: number }> = [];
    let act: ActiveState | null = null;
    return {
      label: ids.length > 1 ? 'Delete layers' : 'Delete layer',
      do(d) {
        act = snapshotActive(d);
        removed = [];
        const set = new Set(ids);
        for (const id of ids) {
          const node = d.getNode(id);
          if (!node) continue;
          let p = d.parentOf(id);
          let covered = false;
          while (p && p !== d.root) {
            if (set.has(p.id)) { covered = true; break; }
            p = d.parentOf(p.id);
          }
          if (covered) continue;
          const parent = d.parentOf(id) as GroupNode;
          const index = parent.children.indexOf(node);
          parent.children.splice(index, 1);
          removed.push({ node, parent, index });
        }
        if (removed.length === 0) return;
        d.emit({ kind: 'tree' });
        if (!act.activeId || !d.getNode(act.activeId)) {
          // Photoshop-style: the layer below the first removed one becomes active.
          const { parent, index } = removed[0];
          const below = parent.children[index - 1] ?? parent.children[index];
          const next = below ?? (parent !== d.root ? parent : null);
          d.activeId = next ? next.id : null;
        }
        d.selectedIds = d.selectedIds.filter((id) => !!d.getNode(id));
        if (d.activeId && !d.selectedIds.includes(d.activeId)) d.selectedIds = [d.activeId];
        if (!d.activeId) d.selectedIds = [];
        d.emit({ kind: 'active' });
      },
      undo(d) {
        if (removed.length === 0) return;
        for (let i = removed.length - 1; i >= 0; i--) {
          const r = removed[i];
          r.parent.children.splice(r.index, 0, r.node);
        }
        d.emit({ kind: 'tree' });
        if (act) restoreActive(d, act);
      },
    };
  },

  moveNode(_doc, id, newParentId, index) {
    let from: { parent: GroupNode; index: number } | null = null;
    return {
      label: 'Move layer',
      do(d) {
        const node = requireNode(d, id);
        const target = parentFor(d, newParentId);
        if (isInside(node, target)) throw new Error('A group cannot be moved into itself');
        const parent = d.parentOf(id) as GroupNode;
        const oldIndex = parent.children.indexOf(node);
        from = { parent, index: oldIndex };
        parent.children.splice(oldIndex, 1);
        target.children.splice(clampIndex(index, target.children.length), 0, node);
        d.emit({ kind: 'tree' });
      },
      undo(d) {
        if (!from) return;
        const node = requireNode(d, id);
        const cur = d.parentOf(id) as GroupNode;
        cur.children.splice(cur.children.indexOf(node), 1);
        from.parent.children.splice(from.index, 0, node);
        d.emit({ kind: 'tree' });
      },
    };
  },

  setProps(_doc, id, patch, mergeKey) {
    return new SetPropsCommand(id, patch as Record<string, unknown>, mergeKey);
  },

  setMask(_doc, id, mask: Mask | null) {
    let before: { mask: Mask | null; enabled: boolean } | null = null;
    return {
      label: mask ? 'Layer mask' : 'Delete mask',
      do(d) {
        const n = requireNode(d, id);
        before = { mask: n.mask, enabled: n.maskEnabled };
        n.mask = mask;
        if (mask && !before.mask) n.maskEnabled = true;
        d.emit({ kind: 'node', nodeId: id });
      },
      undo(d) {
        if (!before) return;
        const n = requireNode(d, id);
        n.mask = before.mask;
        n.maskEnabled = before.enabled;
        d.emit({ kind: 'node', nodeId: id });
      },
    };
  },

  setSelection(_doc, sel: Selection | null) {
    let before: Selection | null = null;
    return {
      label: sel ? 'Select' : 'Deselect',
      do(d) {
        before = d.selection;
        d.selection = sel;
        d.emit({ kind: 'selection' });
      },
      undo(d) {
        d.selection = before;
        d.emit({ kind: 'selection' });
      },
    };
  },

  groupNodes(doc, ids, name) {
    const count = doc.flatten().filter((r) => r.node.type === 'group').length;
    const group = createGroupNode(name ?? `Group ${count + 1}`);
    let entries: Array<{ node: AnyNode; index: number }> = [];
    let parent: GroupNode | null = null;
    let act: ActiveState | null = null;
    return {
      label: 'Group layers',
      do(d) {
        const nodes = ids.map((id) => requireNode(d, id));
        parent = d.parentOf(ids[0]) ?? null;
        if (!parent || ids.some((id) => d.parentOf(id) !== parent)) throw new Error('Only layers in the same group can be grouped together');
        const p = parent;
        act = snapshotActive(d);
        entries = nodes.map((node) => ({ node, index: p.children.indexOf(node) })).sort((a, b) => a.index - b.index);
        const top = entries[entries.length - 1].index;
        for (let i = entries.length - 1; i >= 0; i--) p.children.splice(entries[i].index, 1);
        group.children = entries.map((e) => e.node);
        p.children.splice(top - (entries.length - 1), 0, group);
        d.emit({ kind: 'tree' });
        setActive(d, group.id);
      },
      undo(d) {
        if (!parent) return;
        const p = parent;
        p.children.splice(p.children.indexOf(group), 1);
        group.children = [];
        for (const e of entries) p.children.splice(e.index, 0, e.node);
        d.emit({ kind: 'tree' });
        if (act) restoreActive(d, act);
      },
    };
  },

  duplicateNode(_doc, id) {
    let copy: AnyNode | null = null;
    let act: ActiveState | null = null;
    return {
      label: 'Duplicate layer',
      do(d) {
        const src = requireNode(d, id);
        if (!copy) copy = cloneNode(src);
        const parent = d.parentOf(id) as GroupNode;
        act = snapshotActive(d);
        parent.children.splice(parent.children.indexOf(src) + 1, 0, copy);
        d.emit({ kind: 'tree' });
        setActive(d, copy.id);
      },
      undo(d) {
        if (!copy) return;
        const parent = d.parentOf(copy.id);
        if (parent) parent.children.splice(parent.children.indexOf(copy), 1);
        d.emit({ kind: 'tree' });
        if (act) restoreActive(d, act);
      },
    };
  },

  rasterizeNode: rasterizeNode,
  mergeDown: mergeDown,
  flatten: flattenDocument,
  clearPixels: clearPixels,

  setDocumentName(_doc, name) {
    let before = '';
    return {
      label: 'Rename document',
      do(d) {
        before = d.name;
        d.name = name;
        d.emit({ kind: 'document' });
      },
      undo(d) {
        d.name = before;
        d.emit({ kind: 'document' });
      },
    };
  },

  batch(label, cmds) {
    return {
      label,
      do(d) {
        for (const c of cmds) c.do(d);
      },
      undo(d) {
        for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo(d);
      },
    };
  },
};
