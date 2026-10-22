// Applies data-theme on <html> from the preference ('system' follows the OS and keeps
// listening), and exposes the surround colour the viewport paints behind the document.
import { computed, effect } from '@preact/signals';
import { resolvedTheme, surround, theme } from './state';

export const SURROUND_PRESETS = { light: '#d4d4d8', mid: '#5a5a60', dark: '#121214' } as const;

export const surroundColour = computed(() => {
  const s = surround.value;
  if (s.kind === 'custom') return /^#[0-9a-f]{6}$/i.test(s.custom) ? s.custom : SURROUND_PRESETS.mid;
  return SURROUND_PRESETS[s.kind];
});

export function initTheme(): void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const pref = theme.value;
    const t = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref;
    resolvedTheme.value = t;
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#202024' : '#f6f6f8');
  };
  mq.addEventListener('change', apply);
  effect(apply);
}

export function toggleTheme(): void {
  theme.value = resolvedTheme.value === 'dark' ? 'light' : 'dark';
}
