// .photochop project file: a ZIP (fflate) holding
//   document.json, layers/<id>.png, masks/<id>.png, selection.png, thumbnail.png
// PNGs are stored without recompression; the JSON is deflated.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { CompositorLike, DocumentLike, SerializedDocumentJson } from '@/engine/contract';
import { deserializeParts, serializeParts } from '@/engine/serialize';
import { newId } from '@/engine/document';
import { thumbnailBlob } from '@/engine/thumb';

function toZipPath(key: string): string {
  if (key === 'selection') return 'selection.png';
  if (key.startsWith('layer/')) return `layers/${key.slice(6)}.png`;
  if (key.startsWith('mask/')) return `masks/${key.slice(5)}.png`;
  return `${key}.png`;
}

function fromZipPath(path: string): string | null {
  if (path === 'selection.png') return 'selection';
  let m = /^layers\/(.+)\.png$/.exec(path);
  if (m) return `layer/${m[1]}`;
  m = /^masks\/(.+)\.png$/.exec(path);
  if (m) return `mask/${m[1]}`;
  return null;
}

export async function saveProject(doc: DocumentLike, compositor: CompositorLike): Promise<Blob> {
  const parts = serializeParts(doc);
  const files: Zippable = { 'document.json': [strToU8(JSON.stringify(parts.json)), { level: 6 }] };
  for (const [k, bytes] of Object.entries(parts.files)) files[toZipPath(k)] = [bytes, { level: 0 }];
  try {
    const thumb = await thumbnailBlob(doc, compositor, 320);
    if (thumb) files['thumbnail.png'] = [new Uint8Array(await thumb.arrayBuffer()), { level: 0 }];
  } catch {
    // A missing thumbnail never blocks saving the project.
  }
  const zip = zipSync(files);
  return new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/x-photochop' });
}

export async function openProject(blob: Blob): Promise<DocumentLike> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    throw new Error('This file is not a PhotoChop project');
  }
  const jsonBytes = entries['document.json'];
  if (!jsonBytes) throw new Error('This file is not a PhotoChop project');
  let json: SerializedDocumentJson;
  try {
    json = JSON.parse(strFromU8(jsonBytes)) as SerializedDocumentJson;
  } catch {
    throw new Error('This PhotoChop project is damaged');
  }
  const src: Record<string, Uint8Array> = {};
  for (const [path, bytes] of Object.entries(entries)) {
    const k = fromZipPath(path);
    if (k) src[k] = bytes;
  }
  // A file opened from disk is a new working copy: give it a fresh id so its autosave can
  // never overwrite a newer copy of the same project already recovered on this device.
  json.id = newId();
  return deserializeParts(json, src);
}
