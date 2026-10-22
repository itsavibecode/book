// Compact layout: Layers + Inspector live in a bottom sheet with a drag handle. Collapsed it
// shows the active layer and the save state; half and full show the panel.
import { useRef, useState } from 'preact/hooks';
import { activeLayerName } from './sheetInfo';
import { activeTab, docVersion, sheetState, type SheetState } from '@/app/state';
import { Icon } from './icons';
import { Panel } from './Panel';
import { SaveState } from './StatusBar';

const ORDER: SheetState[] = ['collapsed', 'half', 'full'];

export function sheetHeight(s: SheetState, vh: number): number {
  if (s === 'collapsed') return 56;
  if (s === 'half') return Math.round(vh * 0.42);
  return Math.max(200, vh - 52 - 76 - 16);
}

export function BottomSheet() {
  void docVersion.value;
  const state = sheetState.value;
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y0: number; h0: number; moved: boolean } | null>(null);
  const vh = window.innerHeight;
  const h = dragH ?? sheetHeight(state, vh);
  const tab = activeTab.value;

  const onDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, h0: h, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y0 - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragH(Math.max(56, Math.min(sheetHeight('full', vh), d.h0 + dy)));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      sheetState.value = ORDER[(ORDER.indexOf(state) + 1) % ORDER.length];
    } else if (dragH !== null) {
      const nearest = ORDER.reduce((best, s) => (Math.abs(sheetHeight(s, vh) - dragH) < Math.abs(sheetHeight(best, vh) - dragH) ? s : best), 'collapsed' as SheetState);
      sheetState.value = nearest;
    }
    setDragH(null);
  };

  return (
    <section class={`sheet${dragH !== null ? ' dragging' : ''}`} style={{ height: `${h}px` }} aria-label="Layers and properties" data-testid="sheet" data-state={state}>
      <div
        class="sheet-handle" role="button" tabIndex={0} aria-label={state === 'collapsed' ? 'Show layers' : 'Resize layers sheet'}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sheetState.value = ORDER[(ORDER.indexOf(state) + 1) % ORDER.length]; }
        }}
      >
        <span class="grip" aria-hidden="true" />
        <div class="sheet-row">
          <Icon name="layers" size={18} />
          <span class="sheet-layer">{activeLayerName(tab)}</span>
          <span class="spacer" />
          <SaveState tab={tab} />
        </div>
      </div>
      {state !== 'collapsed' || dragH !== null ? <div class="sheet-body"><Panel inSheet /></div> : null}
    </section>
  );
}
