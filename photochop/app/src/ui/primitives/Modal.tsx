// Modal dialog / sheet. House rules: closes only via X, Cancel or the confirm button (never
// on backdrop click); Esc = Cancel; focus is trapped inside while it is on top.
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { Icon } from '../icons';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  title: string;
  onCancel(): void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  /** 'dialog' is a centred card; 'sheet' is a larger panel (export, network log). */
  variant?: 'dialog' | 'sheet';
  /** Only the top modal traps focus and listens for Esc. */
  top?: boolean;
  testid?: string;
  width?: number;
}

export function Modal({ title, onCancel, children, footer, variant = 'dialog', top = true, testid, width }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useRef(`m-${Math.random().toString(36).slice(2)}`).current;

  useLayoutEffect(() => {
    if (!top) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const auto = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('.modal-body ' + FOCUSABLE) ?? el.querySelector<HTMLElement>(FOCUSABLE);
    auto?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [top]);

  return (
    <div class={`modal-layer m-${variant}`} data-testid={testid ? `${testid}-layer` : undefined}>
      <div class="modal-scrim" aria-hidden="true" />
      <div
        ref={ref} class={`modal m-${variant}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid={testid}
        style={width ? { width: `min(${width}px, calc(100vw - 24px))` } : undefined}
      >
        <header class="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button class="ib" type="button" aria-label="Close" onClick={onCancel}><Icon name="close" /></button>
        </header>
        <div class="modal-body">{children}</div>
        {footer && <footer class="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
