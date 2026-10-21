// Layers panel: toolbar, filter, the layer tree with multi-select, drag to reorder / reparent,
// and a context menu for everything else.
import { useState } from 'preact/hooks';
import { commands as cmds, type AnyNode, type NodeId } from '@/engine';
import { shortcutOf } from '@/app/commands';
import { selectLayer, setActiveNode } from '@/app/docs';
import * as L from '@/app/layerOps';
import { activeTab, docVersion, renameRequest, toast, type DocTab } from '@/app/state';
import { errorText } from '@/app/util';
import { IconButton } from './primitives/controls';
import { PopupMenu, type MenuEntry } from './primitives/PopupMenu';
import { LayerRow } from './LayerRow';

const DRAG_TYPE = 'application/x-strata-layer';

interface Row { node: AnyNode; depth: number }

function visibleRows(tab: DocTab, filter: string): Row[] {
  const all = tab.doc.flatten();
  const f = filter.trim().toLowerCase();
  if (f) return all.filter((r) => r.node.name.toLowerCase().includes(f)).map((r) => ({ node: r.node, depth: 0 }));
  const out: Row[] = [];
  let skipDepth = Infinity;
  for (const r of all) {
    if (r.depth > skipDepth) continue;
    skipDepth = Infinity;
    out.push({ node: r.node, depth: r.depth });
    if (r.node.type === 'group' && !r.node.expanded) skipDepth = r.depth;
  }
  return out;
}

function isDescendant(tab: DocTab, id: NodeId, maybeAncestor: NodeId): boolean {
  for (let p = tab.doc.parentOf(id); p && p !== tab.doc.root; p = tab.doc.parentOf(p.id)) if (p.id === maybeAncestor) return true;
  return false;
}

export function LayersPanel() {
  void docVersion.value;
  const tab = activeTab.value;
  const [filter, setFilter] = useState('');
  const [drag, setDrag] = useState<{ id: NodeId; over: NodeId | null; pos: 'above' | 'below' | 'into' | null } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: NodeId } | null>(null);
  if (!tab) return null;
  const doc = tab.doc;
  const rows = visibleRows(tab, filter);
  const active = L.activeNode(tab);

  const onDrop = (target: AnyNode, pos: 'above' | 'below' | 'into') => {
    if (!drag) return;
    const id = drag.id;
    if (id === target.id || isDescendant(tab, target.id, id)) return;
    const src = doc.getNode(id);
    if (!src) return;
    const parentNode = pos === 'into' && target.type === 'group' ? target : doc.parentOf(target.id);
    if (!parentNode) return;
    let index = pos === 'into' ? parentNode.children.length : doc.indexOf(target.id) + (pos === 'above' ? 1 : 0);
    const srcParent = doc.parentOf(id);
    if (srcParent === parentNode && doc.indexOf(id) < index) index -= 1;
    const parentId = parentNode === doc.root ? null : parentNode.id;
    try {
      doc.history.push(cmds.moveNode(doc, id, parentId, index));
    } catch (e) { toast(errorText(e), 'error'); }
  };

  const menuFor = (n: AnyNode): MenuEntry[] => [
    { label: 'Rename', shortcut: shortcutOf('layer.rename'), run: () => { renameRequest.value = n.id; } },
    { label: 'Duplicate', shortcut: shortcutOf('layer.duplicate'), run: L.duplicateLayer },
    { label: 'Group', shortcut: shortcutOf('layer.group'), run: L.newGroup },
    { label: 'Merge down', shortcut: shortcutOf('layer.mergeDown'), disabled: n.type === 'group', run: L.mergeDown },
    { label: 'Rasterise', disabled: n.type === 'raster', run: () => L.rasterizeLayer(n.id) },
    { kind: 'sep' },
    n.mask ? { label: n.maskEnabled ? 'Turn mask off' : 'Turn mask on', run: L.toggleMask } : { label: 'Add mask', run: () => L.addMask(false) },
    ...(n.mask ? [{ label: 'Delete mask', run: L.deleteMask } as MenuEntry] : doc.selection ? [{ label: 'Add mask from selection', run: () => L.addMask(true) } as MenuEntry] : []),
    { label: n.locked ? 'Unlock' : 'Lock', run: () => L.toggleLock(n.id) },
    { label: 'Hide others', run: () => L.hideOthers(n.id) },
    { label: 'Move up', shortcut: shortcutOf('layer.up'), run: () => L.moveLayer(1) },
    { label: 'Move down', shortcut: shortcutOf('layer.down'), run: () => L.moveLayer(-1) },
    { kind: 'sep' },
    { label: 'Delete', danger: true, run: L.deleteLayers },
  ];

  return (
    <section class="layers" aria-label="Layers" data-testid="layers-panel">
      <div class="ph">
        <h2 class="ph-title">Layers</h2>
        <span class="spacer" />
        <IconButton icon="plus" label="New layer" why="An empty pixel layer above the selected one, so painting never touches what is below" kbd={shortcutOf('layer.new')} small testid="add-layer" onClick={() => L.newLayer()} />
        <IconButton icon="folder" label="New group" why="Groups keep related layers together; with layers selected, they go into the group" kbd={shortcutOf('layer.group')} small onClick={L.newGroup} />
        <IconButton icon="mask" label={doc.selection ? 'Add mask from selection' : 'Add mask'} why="A mask hides parts of the layer without erasing them; paint can bring them back" small disabled={!active || !!active?.mask} onClick={() => L.addMask(!!doc.selection)} />
        <IconButton icon="trash" label="Delete layer" why="Removes the selected layers. Undo brings them back" small disabled={!active} onClick={L.deleteLayers} />
      </div>
      <div class="layer-filter">
        <input class="field" type="search" placeholder="Filter layers" aria-label="Filter layers" value={filter} onInput={(e) => setFilter((e.currentTarget as HTMLInputElement).value)} />
      </div>
      <div
        class="layer-list" role="tree" aria-label="Layer stack" aria-multiselectable="true"
        onClick={(e) => { if (e.target === e.currentTarget) setActiveNode(tab, null); }}
        onKeyDown={(e) => {
          if ((e.key === 'Delete' || e.key === 'Backspace') && (e.target as HTMLElement).classList.contains('layer-row')) { e.preventDefault(); L.deleteLayers(); }
        }}
      >
        {rows.length === 0 && <div class="empty-note">{filter ? 'No layer matches.' : 'No layers yet. Paint, type or drop an image to add one.'}</div>}
        {rows.map(({ node, depth }) => (
          <LayerRow
            key={node.id} tab={tab} node={node} depth={depth} active={node.id === doc.activeId} selected={doc.selectedIds.includes(node.id)}
            dropHint={drag && drag.over === node.id ? drag.pos : null}
            onSelect={(e) => selectLayer(tab, node.id, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'replace')}
            onMenu={(e) => { if (!doc.selectedIds.includes(node.id) || doc.activeId !== node.id) selectLayer(tab, node.id); setMenu({ x: e.clientX, y: e.clientY, id: node.id }); }}
            onDragStart={(e) => {
              e.dataTransfer?.setData(DRAG_TYPE, node.id);
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
              setDrag({ id: node.id, over: null, pos: null });
            }}
            onDragOver={(e) => {
              if (!drag || !e.dataTransfer?.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const y = (e.clientY - r.top) / r.height;
              const pos = node.type === 'group' && y > 0.28 && y < 0.72 ? 'into' : y < 0.5 ? 'above' : 'below';
              if (drag.over !== node.id || drag.pos !== pos) setDrag({ ...drag, over: node.id, pos });
            }}
            onDrop={(e) => { e.preventDefault(); if (drag?.pos) onDrop(node, drag.pos); setDrag(null); }}
            onDragEnd={() => setDrag(null)}
          />
        ))}
      </div>
      {menu && (() => {
        const n = doc.getNode(menu.id);
        return n ? <PopupMenu x={menu.x} y={menu.y} label={`${n.name} actions`} entries={menuFor(n)} onClose={() => setMenu(null)} /> : null;
      })()}
    </section>
  );
}
