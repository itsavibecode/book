import type { ImportedImage } from '@/engine/contract';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/bmp': 'bmp', 'image/x-ms-bmp': 'bmp', 'image/svg+xml': 'svg',
};

export function extensionOf(name: string): string {
  const m = /\.([^./\\]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
}

function stripExt(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').trim() || 'Untitled';
}

function kindOf(file: File | Blob, name: string): string {
  const ext = extensionOf(name);
  if (ext) return ext === 'jpeg' ? 'jpg' : ext;
  return MIME_EXT[file.type] ?? '';
}

async function svgBitmap(file: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // SVGs without intrinsic size report 0; fall back to a sensible canvas.
    const w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.drawImage(img, 0, 0, w, h);
    return await createImageBitmap(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importImageFile(file: File | Blob, name?: string): Promise<ImportedImage> {
  const fileName = name ?? (file instanceof File ? file.name : '') ?? '';
  const kind = kindOf(file, fileName);
  if (!kind || !IMAGE_EXT.includes(kind)) {
    const label = kind ? kind.toUpperCase() : 'these';
    throw new Error(`Strata cannot open ${label} files yet`);
  }
  const notes: string[] = [];
  let bitmap: ImageBitmap;
  try {
    if (kind === 'svg') {
      bitmap = await svgBitmap(file);
      notes.push('SVG: converted to pixels');
    } else {
      bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'default' });
      if (kind === 'gif') notes.push('GIF: first frame only');
    }
  } catch {
    throw new Error('This image could not be read; the file may be damaged');
  }
  return { bitmap, name: stripExt(fileName || 'Untitled'), width: bitmap.width, height: bitmap.height, notes };
}

export function classifyFiles(files: FileList | File[]): { images: File[]; projects: File[]; other: File[] } {
  const images: File[] = [], projects: File[] = [], other: File[] = [];
  for (const f of Array.from(files)) {
    const ext = extensionOf(f.name);
    if (ext === 'strata') projects.push(f);
    else if (IMAGE_EXT.includes(ext) || (!ext && f.type in MIME_EXT)) images.push(f);
    else other.push(f);
  }
  return { images, projects, other };
}
