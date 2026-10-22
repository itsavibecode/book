// The canvas area: two stacked canvases driven by ViewportController, the on-canvas text
// editor, and the zoom pill.
import { useEffect, useRef } from 'preact/hooks';
import { activeTab, compact, viewVersion } from '@/app/state';
import { fit, zoom100, zoomLabel, zoomStep } from '@/app/view';
import { shortcutOf } from '@/app/commands';
import { Icon } from './icons';
import { tip } from './primitives/Tooltip';
import { TextEditor } from './TextEditor';
import { ViewportController } from './viewportController';

export function Viewport() {
  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const ctl = useRef<ViewportController | null>(null);
  const tab = activeTab.value;

  useEffect(() => {
    const c = new ViewportController();
    c.mount(wrap.current!, base.current!, overlay.current!);
    ctl.current = c;
    c.setTab(activeTab.peek());
    overlay.current?.focus({ preventScroll: true });
    return () => c.dispose();
  }, []);

  useEffect(() => { ctl.current?.setTab(tab); }, [tab]);

  return (
    <div class="viewport" ref={wrap} data-testid="viewport">
      <canvas ref={base} class="vp-base" aria-hidden="true" />
      <canvas
        ref={overlay} class="vp-overlay" tabIndex={0} data-testid="canvas"
        aria-label={tab ? `Canvas: ${tab.doc.name}, ${tab.doc.width} by ${tab.doc.height} pixels` : 'Canvas'}
      />
      <TextEditor />
      {!compact.value && tab && <ZoomPill />}
    </div>
  );
}

function ZoomPill() {
  void viewVersion.value;
  const tab = activeTab.value;
  if (!tab) return null;
  return (
    <div class="zoom-pill" role="group" aria-label="Zoom">
      <button type="button" class="zp-btn" aria-label="Zoom out" onClick={() => zoomStep(tab, -1)} {...tip('Zoom out', undefined, shortcutOf('view.zoomOut'), 'top')}><Icon name="minus" size={16} /></button>
      <button type="button" class="zp-val" data-testid="zoom-value" onClick={() => zoom100(tab)} {...tip('Actual size', 'Click to see real pixels at 100%', shortcutOf('view.actual'), 'top')}>{zoomLabel(tab.view.zoom)}</button>
      <button type="button" class="zp-btn" aria-label="Zoom in" onClick={() => zoomStep(tab, 1)} {...tip('Zoom in', undefined, shortcutOf('view.zoomIn'), 'top')}><Icon name="plus" size={16} /></button>
      <button type="button" class="zp-fit" onClick={() => fit(tab)} {...tip('Fit on screen', 'Shows the whole picture', shortcutOf('view.fit'), 'top')}>Fit</button>
    </div>
  );
}
