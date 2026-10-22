// Right panel: Layers above, Inspector below, with a draggable split that is remembered.
import { useRef } from 'preact/hooks';
import { panelSplit } from '@/app/state';
import { clamp } from '@/app/util';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';

export function Panel({ inSheet = false }: { inSheet?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const split = panelSplit.value;
  const startDrag = (e: PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => { panelSplit.value = clamp((ev.clientY - r.top) / r.height, 0.2, 0.8); };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };
  return (
    <div ref={ref} class={`panel${inSheet ? ' in-sheet' : ''}`} style={inSheet ? undefined : { gridTemplateRows: `minmax(0, ${split}fr) 9px minmax(0, ${1 - split}fr)` }}>
      <LayersPanel />
      {!inSheet && (
        <div
          class="split-handle" role="separator" aria-orientation="horizontal" aria-label="Resize layers and inspector" tabIndex={0}
          aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(split * 100)}
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); panelSplit.value = clamp(split - 0.05, 0.2, 0.8); }
            if (e.key === 'ArrowDown') { e.preventDefault(); panelSplit.value = clamp(split + 0.05, 0.2, 0.8); }
          }}
        />
      )}
      <div class="insp-scroll"><Inspector /></div>
    </div>
  );
}
