// Small helpers shared by the command modules.
import type { DocumentLike } from './contract';
import type { AnyNode, NodeId } from './types';

export interface ActiveState { activeId: NodeId | null; selectedIds: NodeId[] }

export function snapshotActive(doc: DocumentLike): ActiveState {
  return { activeId: doc.activeId, selectedIds: [...doc.selectedIds] };
}

export function restoreActive(doc: DocumentLike, s: ActiveState): void {
  doc.activeId = s.activeId;
  doc.selectedIds = [...s.selectedIds];
  doc.emit({ kind: 'active' });
}

export function setActive(doc: DocumentLike, id: NodeId | null): void {
  doc.activeId = id;
  doc.selectedIds = id ? [id] : [];
  doc.emit({ kind: 'active' });
}

export function requireNode(doc: DocumentLike, id: NodeId): AnyNode {
  const n = doc.getNode(id);
  if (!n) throw new Error('That layer no longer exists');
  return n;
}
