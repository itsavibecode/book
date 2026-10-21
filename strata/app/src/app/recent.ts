// Recently run commands, shown first in the command palette when the query is empty.
import { signal } from '@preact/signals';
import { store } from '@/engine';

const KEY = 'recentCommands';
const MAX = 6;

export const recentCommands = signal<string[]>([]);

export async function loadRecentCommands(): Promise<void> {
  try {
    const v = await store.getSetting<string[]>(KEY, []);
    if (Array.isArray(v)) recentCommands.value = v.filter((x) => typeof x === 'string').slice(0, MAX);
  } catch { /* keep empty */ }
}

export function noteCommandUsed(id: string): void {
  const next = [id, ...recentCommands.value.filter((x) => x !== id)].slice(0, MAX);
  recentCommands.value = next;
  try { store.setSetting(KEY, next).catch(() => {}); } catch { /* engine not ready */ }
}
