// Getting pictures in: the file picker, drag and drop anywhere, and paste from the clipboard.
// With a document open, images become new layers; otherwise each image opens as a document.
// .strata projects always open as documents.
import { signal } from '@preact/signals';
import { documentFromBitmap, rasterFromBitmap } from '@/engine';
import { classifyFiles, importImageFile, openStrata } from '@/io';
import { openDocument } from './docs';
import { addNodeHere } from './layerOps';
import { activeTab, toast } from './state';
import { errorText, isTypingTarget } from './util';

/** True while files are dragged over the window (shows the drop hint). */
export const dropHint = signal(false);

export function openPicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*,.strata';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const files = input.files ? Array.from(input.files) : [];
    input.remove();
    if (files.length) void openFiles(files, 'document');
  });
  document.body.appendChild(input);
  input.click();
}

/**
 * mode 'document': every image opens as its own document.
 * mode 'auto': images become layers of the active document when there is one.
 */
export async function openFiles(files: File[], mode: 'auto' | 'document', layerName?: string): Promise<void> {
  let groups: ReturnType<typeof classifyFiles>;
  try {
    groups = classifyFiles(files);
  } catch (e) {
    toast(`Could not read those files: ${errorText(e)}`, 'error');
    return;
  }
  for (const f of groups.other) toast(`${f.name} is not an image or a Strata project`, 'error');
  for (const f of groups.projects) {
    try {
      const doc = await openStrata(f);
      openDocument(doc, { isNew: true });
    } catch (e) {
      toast(`Could not open ${f.name}: ${errorText(e)}`, 'error');
    }
  }
  for (const f of groups.images) {
    try {
      const img = await importImageFile(f, layerName);
      const tab = activeTab.peek();
      if (mode === 'auto' && tab) {
        const x = Math.round((tab.doc.width - img.width) / 2);
        const y = Math.round((tab.doc.height - img.height) / 2);
        const node = rasterFromBitmap(img.bitmap, layerName ?? img.name, x, y);
        addNodeHere(tab, node);
      } else {
        const doc = documentFromBitmap(img.bitmap, layerName ?? img.name);
        openDocument(doc, { isNew: true });
      }
      for (const n of img.notes) toast(n);
    } catch (e) {
      toast(`Could not open ${f.name}: ${errorText(e)}`, 'error');
    }
  }
}

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}

export function initDropAndPaste(): void {
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    dropHint.value = true;
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) dropHint.value = false;
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    dropHint.value = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) void openFiles(files, 'auto');
  });
  window.addEventListener('paste', (e) => {
    if (isTypingTarget(e.target)) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items.filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f);
    if (!files.length) return;
    e.preventDefault();
    void openFiles(files, 'auto', 'Pasted');
  });
}
