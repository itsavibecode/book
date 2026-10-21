// One row in the Layers panel: visibility, thumbnail (+ mask thumbnail), name (double-click to
// rename), lock, group disclosure. Drag and drop is handled by the panel.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AnyNode } from '@/engine';
import { renameRequest, type DocTab } from '@/app/state';
import { setLayerProps, toggleVisible } from '@/app/layerOps';
import { Icon } from './icons';
import { tip } from './primitives/Tooltip';
import { thumbFor, thumbSize, thumbTick } from './thumbs';

function Thumb({ tab, node, kind }: { tab: DocTab; node: AnyNode; kind: 'layer' | 'mask' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = thumbSize(tab.doc);
  const tick = thumbTick.value;
  const bmp = thumbFor(tab, node.id, kind);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    if (bmp) { try { g.drawImage(bmp, 0, 0, c.width, c.height); } catch { /* bitmap was released; the next tick redraws */ } }
  }, [bmp, tick]);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return (
    <canvas
      ref={ref} class={`thumb ${kind === 'mask' ? 'mask-thumb' : 'checker'}${kind === 'mask' && !node.maskEnabled ? ' off' : ''}`}
      width={size.w * dpr} height={size.h * dpr} style={{ width: `${size.w}px`, height: `${size.h}px` }} aria-hidden="true"
    />
  );
}

export interface RowProps {
  tab: DocTab;
  node: AnyNode;
  depth: number;
  active: boolean;
  selected: boolean;
  dropHint: 'above' | 'below' | 'into' | null;
  onSelect(e: MouseEvent): void;
  onMenu(e: MouseEvent): void;
  onDragStart(e: DragEvent): void;
  onDragOver(e: DragEvent): void;
  onDrop(e: DragEvent): void;
  onDragEnd(): void;
}

export function LayerRow(p: RowProps) {
  const { tab, node, depth } = p;
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (renameRequest.value === node.id) { renameRequest.value = null; setEditing(true); }
  }, [renameRequest.value]);
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select(); } }, [editing]);

  const commitName = (v: string) => {
    setEditing(false);
    const name = v.trim();
    if (name && name !== node.name) setLayerProps(tab, node.id, { name });
  };

  const isGroup = node.type === 'group';
  const typeLabel = node.type === 'raster' ? 'Pixel layer' : node.type === 'text' ? 'Text layer' : node.type === 'shape' ? 'Shape layer' : 'Group';
  return (
    <div
      class={`layer-row${p.active ? ' active' : ''}${p.selected ? ' selected' : ''}${!node.visible ? ' hidden-layer' : ''}${p.dropHint ? ` drop-${p.dropHint}` : ''}`}
      style={{ paddingLeft: `${8 + depth * 16}px` }} role="treeitem" aria-selected={p.selected} aria-level={depth + 1}
      aria-expanded={isGroup ? (node as { expanded: boolean }).expanded : undefined} aria-label={`${node.name}, ${typeLabel}`}
      data-testid="layer-row" data-layer-type={node.type} data-layer-name={node.name}
      draggable={!editing} tabIndex={-1}
      onClick={(e) => p.onSelect(e)}
      onContextMenu={(e) => { e.preventDefault(); p.onMenu(e); }}
      onDblClick={(e) => { if ((e.target as HTMLElement).closest('.layer-name')) setEditing(true); }}
      onDragStart={p.onDragStart} onDragOver={p.onDragOver} onDrop={p.onDrop} onDragEnd={p.onDragEnd}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return;
        const ev = e;
        longPress.current = setTimeout(() => p.onMenu(ev as unknown as MouseEvent), 550);
      }}
      onPointerUp={() => { if (longPress.current) clearTimeout(longPress.current); }}
      onPointerCancel={() => { if (longPress.current) clearTimeout(longPress.current); }}
    >
      <button
        type="button" class="row-ib" aria-label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`} aria-pressed={node.visible}
        onClick={(e) => { e.stopPropagation(); toggleVisible(tab, node.id); }}
        {...tip(node.visible ? 'Hide layer' : 'Show layer', 'Hidden layers are not drawn or exported but stay in the file')}
      >
        <Icon name={node.visible ? 'eye' : 'eyeOff'} size={16} />
      </button>
      {isGroup ? (
        <button
          type="button" class="row-ib disclosure" aria-label={(node as { expanded: boolean }).expanded ? 'Collapse group' : 'Expand group'}
          onClick={(e) => { e.stopPropagation(); setLayerProps(tab, node.id, { expanded: !(node as { expanded: boolean }).expanded } as Partial<AnyNode>); }}
        >
          <Icon name={(node as { expanded: boolean }).expanded ? 'chevronDown' : 'chevronRight'} size={16} />
        </button>
      ) : null}
      {isGroup ? (
        <span class="thumb-folder" aria-hidden="true"><Icon name="folder" size={18} /></span>
      ) : (
        <Thumb tab={tab} node={node} kind="layer" />
      )}
      {node.mask && (
        <span
          class="mask-wrap" role="button" tabIndex={-1}
          onClick={(e) => { if (e.shiftKey) { e.stopPropagation(); setLayerProps(tab, node.id, { maskEnabled: !node.maskEnabled }); } }}
          {...tip(node.maskEnabled ? 'Layer mask' : 'Layer mask (off)', 'White shows the layer, black hides it. Shift-click turns the mask off and on')}
        >
          <Thumb tab={tab} node={node} kind="mask" />
        </span>
      )}
      {editing ? (
        <input
          ref={input} class="field layer-name-input" defaultValue={node.name} aria-label="Layer name"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitName((e.currentTarget as HTMLInputElement).value);
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={(e) => commitName((e.currentTarget as HTMLInputElement).value)}
        />
      ) : (
        <span class="layer-name">{node.name}</span>
      )}
      {node.locked && (
        <button
          type="button" class="row-ib lock" aria-label={`Unlock ${node.name}`}
          onClick={(e) => { e.stopPropagation(); setLayerProps(tab, node.id, { locked: false }); }}
          {...tip('Locked', 'Locked layers cannot be painted, moved or deleted by accident. Click to unlock')}
        >
          <Icon name="lock" size={14} />
        </button>
      )}
    </div>
  );
}
