export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

interface SavePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
}

export async function saveAs(blob: Blob, filename: string, description: string, accept: Record<string, string[]>): Promise<FileSystemFileHandle | null> {
  const picker = (globalThis as unknown as SavePickerWindow).showSaveFilePicker;
  if (typeof picker !== 'function') {
    downloadBlob(blob, filename);
    return null;
  }
  let handle: FileSystemFileHandle;
  try {
    handle = await picker.call(globalThis, { suggestedName: filename, types: [{ description, accept }] });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    // Picker refused (no user gesture, sandboxed frame): fall back to a plain download.
    downloadBlob(blob, filename);
    return null;
  }
  const writable = await (handle as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
  await writable.write(blob);
  await writable.close();
  return handle;
}
