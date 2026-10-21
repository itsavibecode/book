// Tool rail (desktop, floating at the left of the canvas) and tool dock (compact, floating at
// the bottom). Only groups with a working tool are shown; right-click or long-press opens the
// group's flyout; a corner triangle marks groups with more than one tool.
import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { shortcutOf } from '@/app/commands';
import { background, colourPopover, compact, foreground, groupMember, toolGroup, toolId } from '@/app/state';
import { cssOf } from '@/app/colour';
import { runCommand } from '@/app/commands';
import { selectGroup, selectTool } from '@/tools';
import { RAIL_GAP_AFTER, TOOL_GROUPS, VISIBLE_GROUPS, availableMembers, memberKey, type ToolGroup } from '@/tools/registry';
import { Icon, toolIcon } from './icons';
import { PopupMenu } from './primitives/PopupMenu';
import { tip } from './primitives/Tooltip';

function currentMember(g: ToolGroup) {
  const members = availableMembers(g);
  const id = groupMember.value[g.id];
  return members.find((m) => m.id === id) ?? members[0];
}

function GroupButton({ g, onFlyout }: { g: ToolGroup; onFlyout(g: ToolGroup, el: HTMLElement): void }) {
  const m = currentMember(g);
  const multi = availableMembers(g).length > 1;
  const on = toolGroup.value === g.id;
  const press = useRef<{ t: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const isCompact = compact.value;
  return (
    <button
      type="button" class={`tool${on ? ' on' : ''}`} aria-label={m.name} aria-pressed={on} data-testid={`tool-${g.id}`}
      {...tip(m.name, m.hint, memberKey(m, g), isCompact ? 'top' : 'right')}
      onClick={() => { if (press.current?.fired) return; selectGroup(g.id); }}
      onContextMenu={(e) => { e.preventDefault(); if (multi) onFlyout(g, e.currentTarget as HTMLElement); }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || !multi) return;
        const el = e.currentTarget as HTMLElement;
        press.current = { fired: false, t: setTimeout(() => { if (press.current) press.current.fired = true; onFlyout(g, el); }, 500) };
      }}
      onPointerUp={() => { if (press.current) { clearTimeout(press.current.t); setTimeout(() => { press.current = null; }, 0); } }}
      onPointerLeave={() => { if (press.current && !press.current.fired) { clearTimeout(press.current.t); press.current = null; } }}
    >
      <Icon name={toolIcon(m.id)} />
      {multi && <i class="fly" aria-hidden="true" />}
    </button>
  );
}

export function ColourSwatches() {
  return (
    <div class="swatches">
      <button
        type="button" class="sw-bg" aria-label="Background colour" data-testid="swatch-bg" style={{ background: cssOf(background.value) }}
        onClick={() => { colourPopover.value = { which: 'bg' }; }} {...tip('Background colour', 'Your second colour: press X to swap it in. Alt-click with the eyedropper sets it', undefined, compact.value ? 'top' : 'right')}
      />
      <button
        type="button" class="sw-fg" aria-label="Foreground colour" data-testid="swatch-fg" style={{ background: cssOf(foreground.value) }}
        onClick={() => { colourPopover.value = { which: 'fg' }; }} {...tip('Foreground colour', 'Brush, fill, text and shapes use this colour', undefined, compact.value ? 'top' : 'right')}
      />
      <button type="button" class="sw-swap" aria-label="Swap colours" onClick={() => runCommand('edit.swapColours')} {...tip('Swap colours', undefined, shortcutOf('edit.swapColours'), 'right')}><Icon name="swap" size={12} /></button>
      <button type="button" class="sw-reset" aria-label="Default colours" onClick={() => runCommand('edit.defaultColours')} {...tip('Black and white', 'Resets to black foreground and white background', shortcutOf('edit.defaultColours'), 'right')}><Icon name="reset" size={12} /></button>
    </div>
  );
}

export function ToolRail() {
  const [fly, setFly] = useState<{ g: ToolGroup; rect: DOMRect } | null>(null);
  const isCompact = compact.value;
  const onFlyout = (g: ToolGroup, el: HTMLElement) => setFly({ g, rect: el.getBoundingClientRect() });
  const items: JSX.Element[] = [];
  VISIBLE_GROUPS.forEach((g, i) => {
    items.push(<GroupButton key={g.id} g={g} onFlyout={onFlyout} />);
    const next = VISIBLE_GROUPS[i + 1];
    if (next && RAIL_GAP_AFTER.some((gap) => order(g.id) <= order(gap) && order(gap) < order(next.id))) {
      items.push(<div key={`gap-${g.id}`} class="rail-gap" aria-hidden="true" />);
    }
  });
  void toolId.value;
  return (
    <nav class={isCompact ? 'dock no-scrollbar' : 'rail'} aria-label="Tools" data-testid={isCompact ? 'dock' : 'rail'}>
      <div class={isCompact ? 'dock-tools' : 'rail-tools'}>{items}</div>
      <ColourSwatches />
      {fly && (
        <PopupMenu
          x={isCompact ? fly.rect.left : fly.rect.right + 8} y={isCompact ? fly.rect.top - 8 - 40 * availableMembers(fly.g).length : fly.rect.top}
          label={`${fly.g.name} tools`} onClose={() => setFly(null)}
          entries={availableMembers(fly.g).map((m) => ({
            label: m.name, checked: currentMember(fly.g).id === m.id, shortcut: memberKey(m, fly.g), run: () => selectTool(m.id), testid: `flyout-${m.id}`,
          }))}
        />
      )}
    </nav>
  );
}

function order(id: string): number { return TOOL_GROUPS.findIndex((g) => g.id === id); }
