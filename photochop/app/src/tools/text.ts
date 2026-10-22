// Text tool. Click empty canvas to start typing (the layer is created with the first
// character, so an abandoned click leaves nothing behind); click a text layer to edit it.
// Typing is a run of mergeable setProps commands. Esc or clicking elsewhere commits.
import { commands as cmds, createTextNode, type DocumentLike, type NodeId, type Point, type TextNode } from '@/engine';
import { addNodeHere } from '@/app/layerOps';
import { setActiveNode } from '@/app/docs';
import { activeTab, documents, foreground, textEdit, toast, toolOptions, type DocTab } from '@/app/state';
import { errorText } from '@/app/util';
import { fontStack } from './options';
import type { Tool } from './types';

let session = 0;
/** Whether the layer name should follow the text (new layers, or names that matched the text). */
let autoName = false;

export function autoLayerName(text: string): string {
  const first = text.split('\n').find((l) => l.trim()) ?? '';
  const t = first.trim();
  return t.length > 32 ? `${t.slice(0, 31)}...` : t || 'Text';
}

/** Topmost visible, unlocked text layer under a document point. */
export function textNodeAt(doc: DocumentLike, p: Point): TextNode | null {
  for (const r of doc.flatten()) {
    const n = r.node;
    if (n.type !== 'text' || !n.visible || n.locked) continue;
    const b = doc.nodeBounds(n.id);
    if (b && p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4) return n;
  }
  return null;
}

export function startTextEdit(tab: DocTab, nodeId: NodeId | null, at: Point): void {
  commitTextEdit();
  session++;
  if (nodeId) {
    const n = tab.doc.getNode(nodeId);
    autoName = !!n && n.type === 'text' && n.name === autoLayerName(n.text);
    setActiveNode(tab, nodeId);
  } else {
    autoName = true;
  }
  textEdit.value = { tabKey: tab.key, nodeId, at, mergeKey: `text-edit:${session}` };
}

function editTab(): DocTab | null {
  const e = textEdit.peek();
  if (!e) return null;
  return documents.peek().find((t) => t.key === e.tabKey) ?? null;
}

/** Called by the on-canvas textarea on every input. */
export function updateEditText(text: string): void {
  const e = textEdit.peek();
  const tab = editTab();
  if (!e || !tab) return;
  const doc = tab.doc;
  try {
    if (!e.nodeId) {
      if (!text) return;
      const o = toolOptions.peek().text;
      const fg = foreground.peek();
      const node = createTextNode(autoLayerName(text), {
        text, font: fontStack(o.font), size: o.size, weight: o.weight, italic: o.italic,
        color: [fg[0], fg[1], fg[2], fg[3]], align: o.align,
        x: Math.round(e.at.x), y: Math.round(e.at.y - o.size * 0.6),
      });
      if (addNodeHere(tab, node)) textEdit.value = { ...e, nodeId: node.id };
      return;
    }
    const patch: Partial<TextNode> = { text };
    if (autoName && text.trim()) patch.name = autoLayerName(text);
    doc.history.push(cmds.setProps(doc, e.nodeId, patch, e.mergeKey));
  } catch (err) {
    toast(errorText(err), 'error');
  }
}

/** Ends editing. Empty text removes the layer. */
export function commitTextEdit(): void {
  const e = textEdit.peek();
  if (!e) return;
  const tab = editTab();
  textEdit.value = null;
  if (!tab || !e.nodeId) return;
  const n = tab.doc.getNode(e.nodeId);
  if (n && n.type === 'text' && !n.text.trim()) {
    try { tab.doc.history.push(cmds.removeNodes(tab.doc, [n.id])); } catch (err) { toast(errorText(err), 'error'); }
  }
}

export const textTool: Tool = {
  id: 'text',
  cursor: 'text',
  onDown(ctx, p) {
    if (p.button !== 0) return;
    if (textEdit.peek()) {
      commitTextEdit();
      return;
    }
    const hit = textNodeAt(ctx.doc, p.doc);
    startTextEdit(ctx.tab, hit ? hit.id : null, p.doc);
  },
  onMove() {},
  onUp() {},
  onKey(_ctx, e) {
    if (e.key === 'Escape' && textEdit.peek()) { commitTextEdit(); return true; }
    return false;
  },
};

/** Enter edit mode on the active text layer (Move tool double-click, Enter key). */
export function editActiveText(): boolean {
  const tab = activeTab.peek();
  const id = tab?.doc.activeId;
  const n = id ? tab!.doc.getNode(id) : undefined;
  if (!tab || !n || n.type !== 'text') return false;
  startTextEdit(tab, n.id, { x: n.x, y: n.y });
  return true;
}
