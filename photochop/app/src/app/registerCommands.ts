// Every command in the app. Menus, the palette and shortcuts read these definitions.
import { cycleGroup, selectGroup, selectTool } from '@/tools';
import { VISIBLE_GROUPS, availableMembers } from '@/tools/registry';
import { commitTextEdit } from '@/tools/text';
import { defineCommands, type AppCommand } from './commands';
import { closeDocument, saveProject } from './docs';
import { openPicker } from './files';
import * as L from './layerOps';
import {
  activeDocIndex, activeTab, background, foreground, openModal, paletteOpen, paletteQuery, panelVisible,
  toolId, toolOptions,
} from './state';
import { toggleTheme } from './theme';
import { clamp } from './util';
import { fit, zoom100, zoomStep } from './view';

const hasDoc = () => !!activeTab.value;
const hasSel = () => !!activeTab.value?.doc.selection;
const hasActive = () => !!activeTab.value?.doc.activeId;

export function openPalette(query = ''): void {
  commitTextEdit();
  paletteQuery.value = query;
  paletteOpen.value = true;
}

function brushSize(delta: 1 | -1): void {
  const id = toolId.peek();
  if (id !== 'brush' && id !== 'eraser') return;
  const o = toolOptions.peek();
  const cur = o[id].size;
  const step = cur < 10 ? 1 : cur < 50 ? 5 : cur < 100 ? 10 : 25;
  toolOptions.value = { ...o, [id]: { ...o[id], size: clamp(cur + delta * step, 1, 500) } };
}

export function registerAllCommands(): void {
  const list: AppCommand[] = [
    // File
    { id: 'file.new', title: 'New document', category: 'File', keywords: 'create blank canvas', run: () => openModal({ kind: 'newdoc' }) },
    { id: 'file.open', title: 'Open...', category: 'File', keys: ['Mod+O'], keywords: 'import file image png jpeg', run: openPicker },
    { id: 'file.openRecent', title: 'Open recent', category: 'File', keywords: 'history documents', run: () => openPalette('Open: ') },
    { id: 'file.close', title: 'Close document', category: 'File', enabled: hasDoc, run: () => closeDocument(activeDocIndex.peek()) },
    { id: 'file.save', title: 'Save project', category: 'File', keys: ['Mod+S'], keywords: 'photochop file download', enabled: hasDoc, run: () => saveProject(activeTab.peek()) },
    { id: 'file.saveAs', title: 'Save project as...', category: 'File', keys: ['Mod+Shift+S'], keywords: 'photochop file download', enabled: hasDoc, run: () => saveProject(activeTab.peek(), true) },
    { id: 'file.export', title: 'Export...', category: 'File', keys: ['Mod+E'], keywords: 'png jpeg webp save image download', enabled: hasDoc, run: () => { commitTextEdit(); openModal({ kind: 'export' }); } },

    // Edit
    { id: 'edit.undo', title: 'Undo', category: 'Edit', keys: ['Mod+Z'], enabled: () => !!activeTab.value?.doc.history.canUndo, run: () => { commitTextEdit(); activeTab.peek()?.doc.history.undo(); } },
    { id: 'edit.redo', title: 'Redo', category: 'Edit', keys: ['Mod+Shift+Z', 'Mod+Y'], enabled: () => !!activeTab.value?.doc.history.canRedo, run: () => { commitTextEdit(); activeTab.peek()?.doc.history.redo(); } },
    { id: 'edit.deletePixels', title: 'Delete selected pixels', category: 'Edit', keys: ['Delete', 'Backspace'], canvasOnly: true, keywords: 'clear erase', enabled: hasActive, run: L.deleteSelectionPixels },
    { id: 'edit.swapColours', title: 'Swap colours', category: 'Edit', keys: ['X'], keywords: 'foreground background', run: () => { const f = foreground.peek(); foreground.value = background.peek(); background.value = f; } },
    { id: 'edit.defaultColours', title: 'Default colours', category: 'Edit', keys: ['D'], keywords: 'black white reset', run: () => { foreground.value = [0, 0, 0, 255]; background.value = [255, 255, 255, 255]; } },
    { id: 'edit.brushBigger', title: 'Bigger brush', category: 'Edit', keys: [']'], keywords: 'size increase', run: () => brushSize(1) },
    { id: 'edit.brushSmaller', title: 'Smaller brush', category: 'Edit', keys: ['['], keywords: 'size decrease', run: () => brushSize(-1) },

    // Select
    { id: 'select.all', title: 'Select all', category: 'Select', keys: ['Mod+A'], enabled: hasDoc, run: L.selectAll },
    { id: 'select.none', title: 'Deselect', category: 'Select', keys: ['Mod+D'], keywords: 'clear selection none', enabled: hasSel, run: L.deselect },
    { id: 'select.invert', title: 'Invert selection', category: 'Select', keys: ['Mod+Shift+I'], keywords: 'inverse', enabled: hasDoc, run: L.invertSelection },

    // Layer
    { id: 'layer.new', title: 'New layer', category: 'Layer', keys: ['Mod+Shift+N'], keywords: 'add pixel layer', enabled: hasDoc, run: () => { L.newLayer(); } },
    { id: 'layer.group', title: 'Group layers', category: 'Layer', keys: ['Mod+G'], keywords: 'folder new group', enabled: hasDoc, run: L.newGroup },
    { id: 'layer.duplicate', title: 'Duplicate layer', category: 'Layer', keys: ['Mod+J'], keywords: 'copy', enabled: hasActive, run: L.duplicateLayer },
    { id: 'layer.delete', title: 'Delete layer', category: 'Layer', keywords: 'remove', enabled: hasActive, run: L.deleteLayers },
    { id: 'layer.mergeDown', title: 'Merge down', category: 'Layer', keys: ['Mod+Shift+E'], keywords: 'combine', enabled: hasActive, run: L.mergeDown },
    { id: 'layer.rasterize', title: 'Rasterise layer', category: 'Layer', keywords: 'rasterize pixels convert', enabled: hasActive, run: () => L.rasterizeLayer() },
    { id: 'layer.addMask', title: 'Add mask', category: 'Layer', keywords: 'layer mask hide reveal', enabled: hasActive, run: () => L.addMask(false) },
    { id: 'layer.addMaskSel', title: 'Add mask from selection', category: 'Layer', keywords: 'layer mask hide reveal', enabled: () => hasActive() && hasSel(), run: () => L.addMask(true) },
    { id: 'layer.toggleMask', title: 'Turn mask on or off', category: 'Layer', keywords: 'disable enable mask', enabled: hasActive, run: L.toggleMask },
    { id: 'layer.deleteMask', title: 'Delete mask', category: 'Layer', keywords: 'remove mask', enabled: hasActive, run: L.deleteMask },
    { id: 'layer.rename', title: 'Rename layer', category: 'Layer', keys: ['F2'], enabled: hasActive, run: L.renameLayer },
    { id: 'layer.up', title: 'Move layer up', category: 'Layer', keys: ['Mod+]'], keywords: 'bring forward order', enabled: hasActive, run: () => L.moveLayer(1) },
    { id: 'layer.down', title: 'Move layer down', category: 'Layer', keys: ['Mod+['], keywords: 'send backward order', enabled: hasActive, run: () => L.moveLayer(-1) },
    { id: 'layer.lock', title: 'Lock or unlock layer', category: 'Layer', keywords: 'protect', enabled: hasActive, run: () => L.toggleLock() },
    { id: 'layer.hideOthers', title: 'Hide other layers', category: 'Layer', keywords: 'solo visibility', enabled: hasActive, run: () => L.hideOthers() },

    // Image
    { id: 'image.flatten', title: 'Flatten image', category: 'Image', keywords: 'merge all', enabled: hasDoc, run: L.flattenImage },
    { id: 'image.export', title: 'Export as PNG, JPEG or WebP', category: 'Image', keywords: 'save download', enabled: hasDoc, run: () => openModal({ kind: 'export' }) },

    // View
    { id: 'view.zoomIn', title: 'Zoom in', category: 'View', keys: ['Mod+=', 'Mod++', 'Mod+Shift++', 'Mod+Shift+='], enabled: hasDoc, run: () => zoomStep(activeTab.peek(), 1) },
    { id: 'view.zoomOut', title: 'Zoom out', category: 'View', keys: ['Mod+-', 'Mod+Shift+-'], enabled: hasDoc, run: () => zoomStep(activeTab.peek(), -1) },
    { id: 'view.fit', title: 'Fit on screen', category: 'View', keys: ['Mod+0'], keywords: 'zoom whole', enabled: hasDoc, run: () => fit() },
    { id: 'view.actual', title: 'Actual size (100%)', category: 'View', keys: ['Mod+1'], keywords: 'zoom pixels', enabled: hasDoc, run: () => zoom100() },
    { id: 'view.togglePanel', title: 'Show or hide the layers panel', category: 'View', keys: ['Tab'], keywords: 'inspector sidebar', run: () => { panelVisible.value = !panelVisible.peek(); } },
    { id: 'view.theme', title: 'Switch light or dark theme', category: 'View', keywords: 'dark mode light mode appearance', run: toggleTheme },
    { id: 'view.network', title: 'Network log', category: 'View', keywords: 'privacy requests on device offline', run: () => openModal({ kind: 'network' }) },

    // Settings and help
    { id: 'settings.open', title: 'Settings', category: 'Settings', keys: ['Mod+,'], keywords: 'preferences theme surround', run: () => openModal({ kind: 'settings' }) },
    { id: 'help.about', title: 'About', category: 'Help', keywords: 'version licence', run: () => openModal({ kind: 'about' }) },
    { id: 'help.palette', title: 'Command palette', category: 'Help', keys: ['Mod+K'], keywords: 'search', hidden: true, run: () => openPalette() },
    { id: 'help.paletteSlash', title: 'Command palette', category: 'Help', keys: ['/'], canvasOnly: true, hidden: true, run: () => openPalette() },
  ];

  // Tools: one command per available member, plus Shift+key cycling per group.
  for (const g of VISIBLE_GROUPS) {
    const members = availableMembers(g);
    const ownKeys = members.some((m) => m.key && m.key !== g.key);
    for (const m of members) {
      const key = m.key ?? (ownKeys ? undefined : g.key);
      list.push({
        id: `tool.${m.id}`, title: m.name, category: 'Tools', keywords: `${g.name} tool ${m.hint}`,
        keys: key && (members.length === 1 || m.key) ? [key] : undefined,
        displayKey: key ?? g.key,
        run: () => selectTool(m.id),
      });
    }
    if (members.length > 1 && !ownKeys) {
      list.push({ id: `group.${g.id}`, title: g.name, category: 'Tools', keys: [g.key], hidden: true, run: () => selectGroup(g.id) });
    }
    const cycleKeys = [g.key, ...members.map((m) => m.key).filter((k): k is string => !!k && k !== g.key)].map((k) => `Shift+${k}`);
    list.push({ id: `cycle.${g.id}`, title: `Next ${g.name.toLowerCase()} tool`, category: 'Tools', keys: cycleKeys, hidden: true, run: () => cycleGroup(g.id) });
  }
  defineCommands(list);
}
