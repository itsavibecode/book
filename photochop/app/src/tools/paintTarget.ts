// Finds the pixel layer a paint tool should write into, or prepares one:
//  - unlocked raster: use it
//  - text / shape: ask before rasterising (returns null; the user paints again after)
//  - group or nothing: create a new pixel layer above and use it
import { commands as cmds, type RasterNode } from '@/engine';
import { activeNode, newLayer } from '@/app/layerOps';
import { confirmModal, toast } from '@/app/state';
import { errorText } from '@/app/util';
import type { ToolContext } from './types';

export function paintTarget(ctx: ToolContext, verb: string): RasterNode | null {
  const n = activeNode(ctx.tab);
  if (n && n.locked) {
    toast('This layer is locked; unlock it in the Layers panel to change it');
    return null;
  }
  if (n && n.type === 'raster') {
    if (!n.visible) toast('This layer is hidden, so changes will not show until you show it');
    return n;
  }
  if (n && (n.type === 'text' || n.type === 'shape')) {
    const kind = n.type === 'text' ? 'text' : 'shape';
    void confirmModal({
      title: `${verb} on this layer?`,
      body: `"${n.name}" is a ${kind} layer. To ${verb.toLowerCase()} on it, it has to become pixels, and the ${kind} will no longer be editable.`,
      confirmLabel: `Rasterise and ${verb.toLowerCase()}`,
    }).then((ok) => {
      if (!ok) return;
      try {
        ctx.doc.history.push(cmds.rasterizeNode(ctx.doc, n.id));
        toast(`Rasterised; ${verb.toLowerCase()} again to continue`);
      } catch (e) {
        toast(errorText(e), 'error');
      }
    });
    return null;
  }
  const id = newLayer();
  if (!id) return null;
  toast(`${verb === 'Fill' ? 'Filling' : 'Painting'} on a new layer`);
  const created = ctx.doc.getNode(id);
  return created && created.type === 'raster' ? created : null;
}
