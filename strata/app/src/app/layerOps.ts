// Layer and selection actions shared by commands, the Layers panel and the tools.
import {
  combineMasks, commands as cmds, createGroupNode, createMask, createRasterNode, invertMask, selectAll as engineSelectAll,
  selectionFromMask, type AnyNode, type DocumentLike, type NodeId,
} from '@/engine';
import { selectLayer, setActiveNode } from './docs';
import { activeTab, bumpDocNow, renameRequest, toast, type DocTab } from './state';
import { errorText } from './util';

function tabOrToast(): DocTab | null {
  const t = activeTab.peek();
  if (!t) toast('Open or create a document first');
  return t;
}

function run(tab: DocTab, fn: () => void): boolean {
  try { fn(); return true; } catch (e) { toast(errorText(e), 'error'); return false; }
}

export function activeNode(tab: DocTab | null = activeTab.peek()): AnyNode | undefined {
  if (!tab || !tab.doc.activeId) return undefined;
  return tab.doc.getNode(tab.doc.activeId);
}

/** Where a new layer goes: above the active one in its parent, or inside an active expanded group. */
export function insertionPoint(doc: DocumentLike): { parentId: NodeId | null; index: number } {
  const a = doc.activeId ? doc.getNode(doc.activeId) : undefined;
  if (!a) return { parentId: null, index: doc.root.children.length };
  if (a.type === 'group' && a.expanded) return { parentId: a.id, index: a.children.length };
  const parent = doc.parentOf(a.id);
  const parentId = !parent || parent === doc.root ? null : parent.id;
  return { parentId, index: doc.indexOf(a.id) + 1 };
}

function countType(doc: DocumentLike, pred: (n: AnyNode) => boolean): number {
  return doc.flatten().filter((r) => pred(r.node)).length;
}

export function addNodeHere(tab: DocTab, node: AnyNode): boolean {
  const { parentId, index } = insertionPoint(tab.doc);
  const ok = run(tab, () => tab.doc.history.push(cmds.addNode(tab.doc, node, parentId, index)));
  if (ok) setActiveNode(tab, node.id);
  return ok;
}

export function newLayer(): NodeId | null {
  const tab = tabOrToast();
  if (!tab) return null;
  const n = createRasterNode(`Layer ${countType(tab.doc, (x) => x.type === 'raster') + 1}`);
  return addNodeHere(tab, n) ? n.id : null;
}

export function newGroup(): void {
  const tab = tabOrToast();
  if (!tab) return;
  const doc = tab.doc;
  const name = `Group ${countType(doc, (x) => x.type === 'group') + 1}`;
  const ids = doc.selectedIds.filter((id) => doc.getNode(id));
  if (ids.length > 0) {
    const parent = doc.parentOf(ids[0]);
    if (ids.every((id) => doc.parentOf(id) === parent)) {
      run(tab, () => doc.history.push(cmds.groupNodes(doc, ids, name)));
      return;
    }
    toast('Group needs layers that sit in the same group');
    return;
  }
  addNodeHere(tab, createGroupNode(name));
}

export function duplicateLayer(): void {
  const tab = tabOrToast();
  const n = activeNode(tab);
  if (!tab || !n) return;
  run(tab, () => tab.doc.history.push(cmds.duplicateNode(tab.doc, n.id)));
}

export function deleteLayers(): void {
  const tab = tabOrToast();
  if (!tab) return;
  const doc = tab.doc;
  const ids = doc.selectedIds.length ? doc.selectedIds.slice() : doc.activeId ? [doc.activeId] : [];
  if (!ids.length) return;
  const order = doc.flatten().map((r) => r.node.id);
  const below = order.slice(order.indexOf(ids[ids.length - 1]) + 1).find((id) => !ids.includes(id));
  if (run(tab, () => doc.history.push(cmds.removeNodes(doc, ids)))) {
    const remaining = doc.flatten().map((r) => r.node.id);
    setActiveNode(tab, below && doc.getNode(below) ? below : remaining[0] ?? null);
  }
}

export function mergeDown(): void {
  const tab = tabOrToast();
  const n = activeNode(tab);
  if (!tab || !n) return;
  const doc = tab.doc;
  const parent = doc.parentOf(n.id);
  const i = doc.indexOf(n.id);
  const below = parent && i > 0 ? parent.children[i - 1] : undefined;
  if (n.type === 'group') { toast('Merge down works on a single layer, not a group'); return; }
  if (!below || below.type !== 'raster') { toast('Merge down needs a pixel layer directly below'); return; }
  if (run(tab, () => doc.history.push(cmds.mergeDown(doc, n.id)))) setActiveNode(tab, below.id);
}

export function flattenImage(): void {
  const tab = tabOrToast();
  if (!tab) return;
  if (run(tab, () => tab.doc.history.push(cmds.flatten(tab.doc)))) {
    const top = tab.doc.root.children[tab.doc.root.children.length - 1];
    setActiveNode(tab, top?.id ?? null);
  }
}

export function rasterizeLayer(id?: NodeId): void {
  const tab = tabOrToast();
  const n = id && tab ? tab.doc.getNode(id) : activeNode(tab);
  if (!tab || !n) return;
  if (n.type === 'raster') { toast('This layer is already pixels'); return; }
  run(tab, () => tab.doc.history.push(cmds.rasterizeNode(tab.doc, n.id)));
}

export function addMask(fromSelection: boolean): void {
  const tab = tabOrToast();
  const n = activeNode(tab);
  if (!tab || !n) return;
  const doc = tab.doc;
  if (n.mask) { toast('This layer already has a mask'); return; }
  if (fromSelection && !doc.selection) { toast('Make a selection first; the mask keeps what is inside it'); return; }
  // A plain mask reveals everything; a mask from the selection keeps only what is selected.
  const mask = fromSelection && doc.selection
    ? { w: doc.selection.mask.w, h: doc.selection.mask.h, data: doc.selection.mask.data.slice() }
    : createMask(doc.width, doc.height, 255);
  run(tab, () => doc.history.push(cmds.setMask(doc, n.id, mask)));
}

export function toggleMask(): void {
  const tab = tabOrToast();
  const n = activeNode(tab);
  if (!tab || !n) return;
  if (!n.mask) { toast('This layer has no mask'); return; }
  run(tab, () => tab.doc.history.push(cmds.setProps(tab.doc, n.id, { maskEnabled: !n.maskEnabled })));
}

export function deleteMask(): void {
  const tab = tabOrToast();
  const n = activeNode(tab);
  if (!tab || !n || !n.mask) return;
  run(tab, () => tab.doc.history.push(cmds.setMask(tab.doc, n.id, null)));
}

export function renameLayer(): void {
  const n = activeNode();
  if (n) renameRequest.value = n.id;
}

export function setLayerProps(tab: DocTab, id: NodeId, patch: Partial<AnyNode>, mergeKey?: string): void {
  run(tab, () => tab.doc.history.push(cmds.setProps(tab.doc, id, patch, mergeKey)));
}

/** Moves the active layer one step up (dir 1) or down (dir -1) inside its parent. */
export function moveLayer(dir: 1 | -1): void {
  const tab = tabOrToast();
  const n = activeNode(tab);
  if (!tab || !n) return;
  const doc = tab.doc;
  const parent = doc.parentOf(n.id);
  if (!parent) return;
  const i = doc.indexOf(n.id);
  const target = i + dir;
  if (target < 0 || target >= parent.children.length) return;
  run(tab, () => doc.history.push(cmds.moveNode(doc, n.id, parent === doc.root ? null : parent.id, target)));
}

export function toggleLock(id?: NodeId): void {
  const tab = tabOrToast();
  const n = id && tab ? tab.doc.getNode(id) : activeNode(tab);
  if (!tab || !n) return;
  setLayerProps(tab, n.id, { locked: !n.locked });
}

export function toggleVisible(tab: DocTab, id: NodeId): void {
  const n = tab.doc.getNode(id);
  if (n) setLayerProps(tab, id, { visible: !n.visible });
}

export function hideOthers(id?: NodeId): void {
  const tab = tabOrToast();
  if (!tab) return;
  const doc = tab.doc;
  const keep = id ?? doc.activeId;
  if (!keep) return;
  // Keep the layer and its ancestors visible; hide every other top-level sibling chain.
  const ancestors = new Set<NodeId>();
  for (let p = doc.parentOf(keep); p && p !== doc.root; p = doc.parentOf(p.id)) ancestors.add(p.id);
  const list = doc.flatten().filter((r) => r.node.id !== keep && !ancestors.has(r.node.id) && r.node.visible && r.parent && (r.parent === doc.root || ancestors.has(r.parent.id)));
  if (!list.length) return;
  run(tab, () => doc.history.push(cmds.batch('Hide others', list.map((r) => cmds.setProps(doc, r.node.id, { visible: false })))));
}

// ---- selection ---------------------------------------------------------------------------------

export function selectAll(): void {
  const tab = tabOrToast();
  if (!tab) return;
  run(tab, () => tab.doc.history.push(cmds.setSelection(tab.doc, engineSelectAll(tab.doc))));
}

export function deselect(): void {
  const tab = activeTab.peek();
  if (!tab || !tab.doc.selection) return;
  run(tab, () => tab.doc.history.push(cmds.setSelection(tab.doc, null)));
}

export function invertSelection(): void {
  const tab = tabOrToast();
  if (!tab) return;
  const doc = tab.doc;
  const sel = doc.selection;
  const next = sel ? selectionFromMask(invertMask(sel.mask)) : engineSelectAll(doc);
  run(tab, () => doc.history.push(cmds.setSelection(doc, next)));
}

export function deleteSelectionPixels(): void {
  const tab = tabOrToast();
  const n = activeNode(tab);
  if (!tab || !n) return;
  if (n.type !== 'raster') { toast('Delete pixels works on pixel layers; use Delete layer for this one'); return; }
  if (n.locked) { toast('This layer is locked'); return; }
  run(tab, () => tab.doc.history.push(cmds.clearPixels(tab.doc, n.id)));
}

/** Union a selection mask into the current one (used by tools). */
export function combineSelection(tab: DocTab, mask: ReturnType<typeof createMask>, op: 'replace' | 'add' | 'subtract' | 'intersect'): void {
  const doc = tab.doc;
  const combined = combineMasks(doc.selection?.mask ?? null, mask, op);
  run(tab, () => doc.history.push(cmds.setSelection(doc, selectionFromMask(combined))));
}

export function renameDocument(tab: DocTab, name: string): void {
  const n = name.trim();
  if (!n || n === tab.doc.name) return;
  run(tab, () => tab.doc.history.push(cmds.setDocumentName(tab.doc, n)));
  bumpDocNow();
}

export { selectLayer };
