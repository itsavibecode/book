// The Menu button's popover: six groups (File, Edit, Image, Layer, Select, View) on the left,
// that group's commands on the right. Built from the command registry, so every item shows
// the shortcut that actually works.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { isEnabled, registry, runCommand, shortcutOf, type Category } from '@/app/commands';
import { docVersion } from '@/app/state';

const GROUPS: Category[] = ['File', 'Edit', 'Image', 'Layer', 'Select', 'View'];

/** Extra commands listed under a menu group although their category differs. */
const EXTRA: Partial<Record<Category, string[]>> = {
  View: ['settings.open', 'help.about'],
};

export function MainMenu({ anchor, onClose }: { anchor: DOMRect; onClose(): void }) {
  const [group, setGroup] = useState<Category>('File');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: anchor.right - 460, y: anchor.bottom + 6 });
  void docVersion.value;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    setPos({ x: Math.max(8, Math.min(anchor.right - w, window.innerWidth - w - 8)), y: anchor.bottom + 6 });
    el.querySelector<HTMLElement>('.mm-group.on')?.focus();
  }, [anchor]);

  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const t = setTimeout(() => document.addEventListener('pointerdown', down, true), 0);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', onClose);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', onClose); };
  }, [onClose]);

  const cmds = registry.value.filter((c) => !c.hidden && (c.category === group || EXTRA[group]?.includes(c.id)));

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const col = t.closest('.mm-col');
      if (!col) return;
      const items = Array.from(col.querySelectorAll<HTMLElement>('button:not([disabled])'));
      const i = items.indexOf(t);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'ArrowRight' && t.classList.contains('mm-group')) {
      e.preventDefault();
      ref.current?.querySelector<HTMLElement>('.mm-items button:not([disabled])')?.focus();
    } else if (e.key === 'ArrowLeft' && t.closest('.mm-items')) {
      e.preventDefault();
      ref.current?.querySelector<HTMLElement>('.mm-group.on')?.focus();
    }
  };

  return (
    <div ref={ref} class="main-menu" role="menu" aria-label="Menu" style={{ left: `${pos.x}px`, top: `${pos.y}px` }} onKeyDown={onKeyDown} data-testid="main-menu">
      <div class="mm-col mm-groups">
        {GROUPS.map((g) => (
          <button
            key={g} type="button" class={`mm-group${g === group ? ' on' : ''}`} role="menuitem" aria-haspopup="true" aria-expanded={g === group}
            onPointerEnter={() => setGroup(g)} onFocus={() => setGroup(g)} onClick={() => setGroup(g)}
          >
            {g}
          </button>
        ))}
      </div>
      <div class="mm-col mm-items" role="group" aria-label={group}>
        {cmds.map((c) => (
          <button
            key={c.id} type="button" role="menuitem" class="menu-item" disabled={!isEnabled(c)} data-testid={`menu-${c.id}`}
            onClick={() => { onClose(); runCommand(c.id); }}
          >
            <span>{c.title}</span>
            {shortcutOf(c.id) && <span class="k">{shortcutOf(c.id)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
