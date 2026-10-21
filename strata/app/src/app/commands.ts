// The command registry. Every action in the app is a Command; menus, keyboard shortcuts and the
// command palette all read from here, so a shortcut shown in a menu is always the one that works.
import { signal } from '@preact/signals';
import { noteCommandUsed } from './recent';
import { toast } from './state';
import { errorText, isMac } from './util';

export type Category = 'File' | 'Edit' | 'Layer' | 'Select' | 'Image' | 'View' | 'Tools' | 'Settings' | 'Help';

export interface AppCommand {
  id: string;
  title: string;
  category: Category;
  /** Key specs, first one is displayed. 'Mod' = Ctrl (Cmd on Mac). Examples: 'Mod+Shift+Z', 'B', 'Shift+B', '[', 'Delete'. */
  keys?: string[];
  /** Shown when the command has no keys of its own (tool members that share their group key). */
  displayKey?: string;
  /** Only fires from the keyboard when the canvas has focus (Delete, '/', arrows). */
  canvasOnly?: boolean;
  /** Extra words the palette matches on. */
  keywords?: string;
  /** Hidden from the palette (e.g. per-member cycling helpers). */
  hidden?: boolean;
  run(): void | Promise<void>;
  enabled?(): boolean;
}

export const registry = signal<AppCommand[]>([]);
const byId = new Map<string, AppCommand>();

export function defineCommands(list: AppCommand[]): void {
  for (const c of list) byId.set(c.id, c);
  registry.value = Array.from(byId.values());
}

export function getCommand(id: string): AppCommand | undefined {
  return byId.get(id);
}

export function isEnabled(c: AppCommand): boolean {
  try { return c.enabled ? c.enabled() : true; } catch { return false; }
}

export function runCommand(id: string, opts: { fromPalette?: boolean } = {}): void {
  const c = byId.get(id);
  if (!c || !isEnabled(c)) return;
  if (opts.fromPalette) noteCommandUsed(id);
  try {
    const r = c.run();
    if (r && typeof (r as Promise<void>).catch === 'function') {
      (r as Promise<void>).catch((e) => toast(errorText(e), 'error'));
    }
  } catch (e) {
    toast(errorText(e), 'error');
  }
}

// ---- key specs ---------------------------------------------------------------------------------

interface KeySpec { mod: boolean; shift: boolean; alt: boolean; key: string }

const specCache = new Map<string, KeySpec>();

function parseSpec(spec: string): KeySpec {
  const hit = specCache.get(spec);
  if (hit) return hit;
  // Split on '+' but allow the key itself to be '+'.
  const parts = spec === '+' ? ['+'] : spec.endsWith('++') ? [...spec.slice(0, -2).split('+'), '+'] : spec.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  const s: KeySpec = { mod: mods.includes('mod'), shift: mods.includes('shift'), alt: mods.includes('alt'), key: key.toLowerCase() };
  specCache.set(spec, s);
  return s;
}

export function matchesKey(spec: string, e: KeyboardEvent): boolean {
  const s = parseSpec(spec);
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod !== s.mod || e.shiftKey !== s.shift || e.altKey !== s.alt) return false;
  if (!isMac && e.metaKey) return false;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (k === s.key) return true;
  // Layout-independent fallback for letters and digits (e.g. Ctrl+Shift+Z reporting 'Z').
  if (s.key.length === 1 && /[a-z0-9]/.test(s.key)) {
    return e.code === `Key${s.key.toUpperCase()}` || e.code === `Digit${s.key}`;
  }
  return false;
}

/** Display form: 'Ctrl Shift Z', 'Cmd Z' on Mac. */
export function displayKey(spec: string | undefined): string {
  if (!spec) return '';
  const s = parseSpec(spec);
  const names: Record<string, string> = {
    delete: 'Delete', backspace: 'Backspace', tab: 'Tab', escape: 'Esc', arrowup: 'Up', arrowdown: 'Down',
    arrowleft: 'Left', arrowright: 'Right', f2: 'F2', '=': '+', ' ': 'Space',
  };
  const key = names[s.key] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return [s.mod ? (isMac ? 'Cmd' : 'Ctrl') : '', s.alt ? (isMac ? 'Option' : 'Alt') : '', s.shift ? 'Shift' : '', key]
    .filter(Boolean).join(' ');
}

export function shortcutOf(id: string): string {
  const c = byId.get(id);
  return displayKey(c?.keys?.[0] ?? c?.displayKey);
}
