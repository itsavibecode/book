import type { DocTab } from '@/app/state';

export function activeLayerName(tab: DocTab | null): string {
  if (!tab) return 'No document';
  const id = tab.doc.activeId;
  const n = id ? tab.doc.getNode(id) : undefined;
  return n ? n.name : tab.doc.name;
}
