// Shared tooltip: any element with data-tip gets a custom tooltip after a 500 ms hover or on
// keyboard focus. One host listens at the document level, so controls only spread `tip(...)`.
//   <button {...tip('Undo', 'Steps back through your changes', 'Ctrl Z')}>
import { useEffect, useState } from 'preact/hooks';

export type TipPlace = 'top' | 'bottom' | 'left' | 'right';

export function tip(title: string, why?: string, kbd?: string, place: TipPlace = 'bottom'): Record<string, string> {
  const out: Record<string, string> = { 'data-tip': title, 'data-tip-place': place };
  if (why) out['data-tip-why'] = why;
  if (kbd) out['data-tip-kbd'] = kbd;
  return out;
}

interface TipState { title: string; why?: string; kbd?: string; place: TipPlace; rect: DOMRect }

export function TooltipHost() {
  const [state, setState] = useState<TipState | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let lastPointer = 'mouse';
    const hide = () => { if (timer) clearTimeout(timer); timer = undefined; current = null; setState(null); };
    const show = (el: HTMLElement, delay: number) => {
      if (timer) clearTimeout(timer);
      current = el;
      timer = setTimeout(() => {
        if (!current || !document.contains(current)) return;
        setState({
          title: el.dataset.tip ?? '', why: el.dataset.tipWhy, kbd: el.dataset.tipKbd,
          place: (el.dataset.tipPlace as TipPlace) || 'bottom', rect: el.getBoundingClientRect(),
        });
      }, delay);
    };
    const over = (e: PointerEvent) => {
      lastPointer = e.pointerType;
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el === current) return;
      if (!el) { hide(); return; }
      show(el, 500);
    };
    const focusIn = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el || lastPointer === 'touch') return;
      if (!(el as HTMLElement).matches(':focus-visible')) return;
      show(el, 500);
    };
    const down = (e: PointerEvent) => { lastPointer = e.pointerType; hide(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  useEffect(() => {
    if (!state) { setPos(null); return; }
    const el = document.querySelector('.tooltip') as HTMLElement | null;
    if (!el) return;
    const tw = el.offsetWidth, th = el.offsetHeight, r = state.rect, gap = 8;
    let x = r.left + r.width / 2 - tw / 2, y = r.bottom + gap;
    if (state.place === 'top') y = r.top - th - gap;
    if (state.place === 'right') { x = r.right + gap; y = r.top + r.height / 2 - th / 2; }
    if (state.place === 'left') { x = r.left - tw - gap; y = r.top + r.height / 2 - th / 2; }
    if (y + th > window.innerHeight - 4) y = r.top - th - gap;
    if (y < 4) y = r.bottom + gap;
    x = Math.max(6, Math.min(x, window.innerWidth - tw - 6));
    setPos({ x, y });
  }, [state]);

  if (!state) return null;
  return (
    <div class={`tooltip${state.why ? ' stack' : ''}`} role="tooltip" style={{ left: `${pos?.x ?? -9999}px`, top: `${pos?.y ?? -9999}px` }}>
      {state.why ? (
        <>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}><b>{state.title}</b>{state.kbd && <kbd>{state.kbd}</kbd>}</div>
          <div class="why">{state.why}</div>
        </>
      ) : (
        <><b>{state.title}</b>{state.kbd && <kbd>{state.kbd}</kbd>}</>
      )}
    </div>
  );
}
