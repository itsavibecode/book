// Loads persisted settings from the engine store at boot and writes them back when they change.
// The theme is also mirrored to localStorage so the first paint already has the right colours.
import { effect, type Signal } from '@preact/signals';
import { store } from '@/engine';
import { mergeToolOptions } from '@/tools/options';
import { VISIBLE_GROUPS, availableMembers, type GroupId, type ToolId } from '@/tools/registry';
import {
  background, foreground, groupMember, panelSplit, panelVisible, pixelGrid, recentColours, surround, theme,
  toolGroup, toolOptions, type ThemePref,
} from './state';
import { debounce, safeLocalGet, safeLocalSet } from './util';

const THEME_KEY = 'strata-theme';

export function readCachedTheme(): ThemePref {
  const t = safeLocalGet(THEME_KEY);
  return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
}

function bind<T>(sig: Signal<T>, key: string, validate?: (v: T) => boolean): Promise<void> {
  return store.getSetting<T>(key, sig.peek()).then((v) => {
    if (v !== undefined && v !== null && (!validate || validate(v))) sig.value = v;
  }).catch(() => { /* first run or storage blocked: keep defaults */ }).then(() => {
    const save = debounce((value: T) => { store.setSetting(key, value).catch(() => {}); }, 300);
    let first = true;
    effect(() => {
      const value = sig.value;
      if (first) { first = false; return; }
      save(value);
    });
  });
}

const isGroup = (g: GroupId) => VISIBLE_GROUPS.some((x) => x.id === g);

export async function loadSettings(): Promise<void> {
  theme.value = readCachedTheme();
  effect(() => safeLocalSet(THEME_KEY, theme.value));
  await Promise.all([
    bind(theme, 'theme'),
    bind(surround, 'surround', (v) => !!v && typeof v === 'object' && 'kind' in v),
    bind(pixelGrid, 'pixelGrid', (v) => typeof v === 'boolean'),
    bind(panelSplit, 'panelSplit', (v) => typeof v === 'number' && v >= 0.15 && v <= 0.85),
    bind(panelVisible, 'panelVisible', (v) => typeof v === 'boolean'),
    bind(foreground, 'foreground', Array.isArray),
    bind(background, 'background', Array.isArray),
    bind(recentColours, 'recentColours', Array.isArray),
    bind(toolGroup, 'toolGroup', isGroup),
    bind(groupMember, 'groupMember', (v) => {
      // Drop members that are no longer available.
      if (!v || typeof v !== 'object') return false;
      for (const [g, m] of Object.entries(v) as Array<[GroupId, ToolId]>) {
        const grp = VISIBLE_GROUPS.find((x) => x.id === g);
        if (!grp || !availableMembers(grp).some((x) => x.id === m)) delete (v as Record<string, unknown>)[g];
      }
      return true;
    }),
  ]);
  try {
    const saved = await store.getSetting<unknown>('toolOptions', null);
    toolOptions.value = mergeToolOptions(saved);
  } catch { /* keep defaults */ }
  const saveOpts = debounce(() => { store.setSetting('toolOptions', toolOptions.peek()).catch(() => {}); }, 400);
  let first = true;
  effect(() => {
    void toolOptions.value;
    if (first) { first = false; return; }
    saveOpts();
  });
}
