// "More" chip for the context bar: secondary options in a small popover so the bar itself
// always fits on a desktop without scrolling or clipping. Portalled to <body> so no panel
// stacking context can cover it.
import { createPortal, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { clamp } from '@/app/util';
import { Icon } from './icons';
import { tip } from './primitives/Tooltip';

export function MoreChip({ label = 'More', why, children, testid }: { label?: string; why: string; children: ComponentChildren; testid?: string }) {
  const [open, setOpen] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !pop.current) { setPos(null); return; }
    const w = pop.current.offsetWidth, h = pop.current.offsetHeight;
    // Below the chip on desktop; above it when there is no room (the compact pill sits low).
    const below = open.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, open.top - h - 6) : below;
    setPos({ left: clamp(open.left, 8, window.innerWidth - w - 8), top });
  }, [open]);
  // Focus the first control once visible (hidden elements cannot take focus).
  useLayoutEffect(() => { if (pos) pop.current?.querySelector<HTMLElement>('input, button, select')?.focus(); }, [pos]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(null); btn.current?.focus(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', () => setOpen(null), { once: true });
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, [open]);

  return (
    <>
      <button
        ref={btn} type="button" class={`chip more-chip${open ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={!!open} data-testid={testid}
        onClick={(e) => setOpen(open ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())} {...tip(label, why)}
      >
        {label}<Icon name="chevronDown" size={14} />
      </button>
      {open && createPortal(
        <div ref={pop} class="more-pop" role="dialog" aria-label={label} style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { visibility: 'hidden', left: '0px', top: '0px' }}>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
