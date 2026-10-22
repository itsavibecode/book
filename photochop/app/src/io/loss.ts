import type { DocumentLike, ExportFormat, LossItem } from '@/engine/contract';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What a flat export loses, in display order. The project format loses nothing. */
export function lossList(doc: DocumentLike, format: ExportFormat | 'photochop'): LossItem[] {
  if (format === 'photochop') return [];
  const rows = doc.flatten();
  let text = 0, shape = 0, layers = 0, masks = 0;
  for (const { node } of rows) {
    if (node.type === 'text') text++;
    if (node.type === 'shape') shape++;
    if (node.type !== 'group') layers++;
    if (node.mask) masks++;
  }
  const out: LossItem[] = [];
  if (format === 'jpeg') out.push({ text: 'Transparency will be filled with white' });
  if (text) out.push({ text: `${plural(text, 'text layer', 'text layers')} will be rasterised` });
  if (shape) out.push({ text: `${plural(shape, 'shape layer', 'shape layers')} will be rasterised` });
  if (layers > 1) out.push({ text: `${layers} layers will be flattened into one image` });
  if (masks) out.push({ text: `${plural(masks, 'mask', 'masks')} will be baked into the pixels` });
  if (doc.selection) out.push({ text: 'The selection will not be saved' });
  return out;
}
