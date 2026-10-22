// Dropdown / context menu. Menus are not forms, so they close on outside click and Esc.
// Keyboard: Up/Down move, Enter runs, Left/Right switch groups when `groups` are used.
import { createPortal, type ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';

export type MenuEntry =
  | { kind?: 'item'; label: string; shortcut?: string; disabled?: boolean; danger?: boolean; checked?: boolean; run(): void; testid?: string }
  | { kind: 'sep' }
  | { kind: 'label'; label: string };

export function PopupMenu({ x, y, entries, onClose, label, minWidth, children }: {
  x: number; y: number; entries: MenuEntry[]; onClose(): void; label: string; minWidth?: number; children?: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState(-1);
  const items = entries.map((e, i) => ({ e, i })).filter(({ e }) => (e.kind ?? 'item') === 'item' && !(e as { disabled?: boolean }).disabled);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    setPos({ x: Math.max(8, Math.min(x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(y, window.innerHeight - h - 8)) });
    el.focus();
  }, [x, y]);

  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    const t = setTimeout(() => document.addEventListener('pointerdown', down, true), 0);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      const cur = items.findIndex((it) => it.i === active);
      const next = e.key === 'ArrowDown' ? (cur + 1) % items.length : (cur - 1 + items.length) % items.length;
      setActive(items[next].i);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const it = entries[active];
      if ((it.kind ?? 'item') === 'item') { onClose(); (it as { run(): void }).run(); }
    }
  };

  return createPortal(
    <div
      ref={ref} class={`menu${entries.some((e) => (e.kind ?? 'item') === 'item' && (e as { checked?: boolean }).checked !== undefined) ? ' has-checks' : ''}`} role="menu" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, minWidth: minWidth ? `${minWidth}px` : undefined }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      {entries.map((e, i) => {
        if (e.kind === 'sep') return <div key={i} class="menu-sep" role="separator" />;
        if (e.kind === 'label') return <div key={i} class="menu-label">{e.label}</div>;
        return (
          <button
            key={i} type="button" role={e.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={e.checked} class={`menu-item${i === active ? ' active' : ''}${e.danger ? ' danger' : ''}`}
            disabled={e.disabled} data-testid={e.testid} onPointerEnter={() => setActive(i)}
            onClick={() => { onClose(); e.run(); }}
          >
            <span class="mi-check" aria-hidden="true">{e.checked ? <Icon name="check" size={16} /> : null}</span>
            <span>{e.label}</span>
            {e.shortcut && <span class="k">{e.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
