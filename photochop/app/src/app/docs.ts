// Open documents (tabs): open, close, create, activate, and the active-layer helpers the
// panels and tools share.
import {
  createAutosave, createCompositor, createDocument, store, type DocumentLike, type NodeId, type RGBA,
} from '@/engine';
import { saveAs, saveProject as encodeProject } from '@/io';
import {
  activeDocIndex, activeTab, bumpDoc, bumpDocNow, documents, saveVersion, textEdit, toast, type DocTab,
} from './state';
import { dropThumbs } from '@/ui/thumbs';
import { errorText } from './util';

let nextKey = 1;

export function persistOpenList(): void {
  const ids = documents.peek().map((t) => t.doc.id);
  store.setOpenDocuments(ids).catch(() => { /* recovery list is best effort */ });
}

/** Adds a document as a new tab and makes it active. `isNew` writes it once so recovery finds it. */
export function openDocument(doc: DocumentLike, opts: { isNew?: boolean; restore?: boolean } = {}): DocTab {
  const existing = documents.peek().findIndex((t) => t.doc.id === doc.id);
  if (existing >= 0) {
    activeDocIndex.value = existing;
    return documents.peek()[existing];
  }
  const compositor = createCompositor('auto');
  compositor.resize(doc.width, doc.height);
  const autosave = createAutosave();
  autosave.attach(doc);
  const tab: DocTab = {
    key: nextKey++, doc, compositor, autosave, view: { zoom: 1, panX: 0, panY: 0 }, needsFit: true, autoFit: true, fileHandle: null, unsubs: [],
  };
  tab.unsubs.push(doc.subscribe(() => bumpDoc()));
  tab.unsubs.push(doc.history.subscribe(() => bumpDoc()));
  tab.unsubs.push(autosave.subscribe(() => { saveVersion.value++; }));
  if (!doc.activeId) {
    const top = doc.root.children[doc.root.children.length - 1];
    if (top) { doc.activeId = top.id; doc.selectedIds = [top.id]; }
  }
  documents.value = [...documents.peek(), tab];
  activeDocIndex.value = documents.peek().length - 1;
  if (opts.isNew) {
    store.saveDocument(doc).catch(() => {}).then(persistOpenList);
  } else if (!opts.restore) {
    persistOpenList();
  }
  return tab;
}

export async function closeDocument(index: number): Promise<void> {
  const tab = documents.peek()[index];
  if (!tab) return;
  if (textEdit.peek()?.tabKey === tab.key) textEdit.value = null;
  try { await tab.autosave.flush(); } catch { /* the document stays in Recent with its last saved state */ }
  tab.autosave.detach();
  tab.unsubs.forEach((u) => u());
  try { tab.compositor.dispose(); } catch { /* ignore */ }
  dropThumbs(tab.key);
  const list = documents.peek().filter((t) => t !== tab);
  documents.value = list;
  const cur = activeDocIndex.peek();
  activeDocIndex.value = list.length === 0 ? -1 : Math.min(cur >= index ? Math.max(0, cur - 1) : cur, list.length - 1);
  persistOpenList();
}

export function activateDocument(index: number): void {
  if (index >= 0 && index < documents.peek().length) {
    textEdit.value = null;
    activeDocIndex.value = index;
  }
}

/** 'Untitled', then 'Untitled 2', ... among open tabs. */
export function nextUntitledName(base = 'Untitled'): string {
  const names = new Set(documents.peek().map((t) => t.doc.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

export function newDocument(name: string, width: number, height: number, bg: RGBA | null): DocTab | null {
  try {
    const doc = createDocument({ name: name.trim() || nextUntitledName(), width, height, background: bg });
    return openDocument(doc, { isNew: true });
  } catch (e) {
    toast(`Could not create the document: ${errorText(e)}`, 'error');
    return null;
  }
}

export async function flushAll(): Promise<void> {
  await Promise.all(documents.peek().map((t) => t.autosave.flush().catch(() => {})));
}

// ---- active layer helpers ----------------------------------------------------------------------

/** Selects layers in the panel sense. mode: replace, toggle (Ctrl-click), range (Shift-click). */
export function selectLayer(tab: DocTab, id: NodeId, mode: 'replace' | 'toggle' | 'range' = 'replace'): void {
  const doc = tab.doc;
  if (mode === 'toggle') {
    const has = doc.selectedIds.includes(id);
    const next = has ? doc.selectedIds.filter((x) => x !== id) : [...doc.selectedIds, id];
    doc.selectedIds = next;
    doc.activeId = has ? (next[next.length - 1] ?? null) : id;
  } else if (mode === 'range' && doc.activeId) {
    const order = doc.flatten().map((r) => r.node.id);
    const a = order.indexOf(doc.activeId), b = order.indexOf(id);
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const parent = doc.parentOf(id);
      doc.selectedIds = order.slice(lo, hi + 1).filter((x) => doc.parentOf(x) === parent);
      if (!doc.selectedIds.includes(doc.activeId)) doc.selectedIds.push(doc.activeId);
    }
  } else {
    doc.activeId = id;
    doc.selectedIds = [id];
  }
  bumpDocNow();
}

export function setActiveNode(tab: DocTab, id: NodeId | null): void {
  tab.doc.activeId = id;
  tab.doc.selectedIds = id ? [id] : [];
  bumpDocNow();
}

export function requireTab(): DocTab | null {
  const t = activeTab.peek();
  if (!t) toast('Open or create a document first');
  return t;
}

// ---- projects ----------------------------------------------------------------------------------

const PROJECT_ACCEPT = { 'application/x-photochop': ['.photochop'] };

export async function saveProject(tab: DocTab | null, forcePicker = false): Promise<void> {
  if (!tab) return;
  try {
    const blob = await encodeProject(tab.doc, tab.compositor);
    const filename = `${tab.doc.name}.photochop`;
    if (tab.fileHandle && !forcePicker) {
      const w = await tab.fileHandle.createWritable();
      await w.write(blob);
      await w.close();
      toast(`Saved ${filename}`);
      return;
    }
    const handle = await saveAs(blob, filename, 'PhotoChop project', PROJECT_ACCEPT);
    tab.fileHandle = handle;
    toast(`Saved ${handle?.name ?? filename}`);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    toast(`Could not save the project: ${errorText(e)}`, 'error');
  }
}
