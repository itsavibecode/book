// Command palette (Ctrl K, or '/' on the canvas): fuzzy search over every command, the layers
// of the active document and recent documents. Recent commands first when the query is empty.
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { store, type DocumentMeta } from '@/engine';
import { isEnabled, registry, runCommand, shortcutOf } from '@/app/commands';
import { activateDocument, openDocument, selectLayer } from '@/app/docs';
import { closest, fuzzyScore } from '@/app/fuzzy';
import { recentCommands } from '@/app/recent';
import { activeTab, documents, paletteOpen, paletteQuery, toast } from '@/app/state';
import { focusCanvas } from '@/app/shortcuts';
import { errorText } from '@/app/util';
import { Icon } from './icons';

interface Entry { id: string; title: string; group: string; keywords?: string; shortcut?: string; run(): void }
interface Scored extends Entry { score: number; hits: number[] }

const GROUP_ORDER = ['Recent', 'Tools', 'File', 'Edit', 'Layer', 'Select', 'Image', 'View', 'Layers', 'Documents', 'Settings', 'Help'];

function Highlight({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>;
  const set = new Set(hits);
  const out: ComponentChildren[] = [];
  let buf = '', on = false;
  const flush = () => { if (buf) out.push(on ? <mark key={out.length}>{buf}</mark> : buf); buf = ''; };
  for (let i = 0; i < text.length; i++) {
    const h = set.has(i);
    if (h !== on) { flush(); on = h; }
    buf += text[i];
  }
  flush();
  return <>{out}</>;
}

export function CommandPalette() {
  const [query, setQuery] = useState(paletteQuery.peek());
  const [index, setIndex] = useState(0);
  const [recentDocs, setRecentDocs] = useState<DocumentMeta[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const close = () => { paletteOpen.value = false; focusCanvas(); };

  // Layout effect so the field has focus before the next key event arrives.
  useLayoutEffect(() => {
    input.current?.focus();
    const len = input.current?.value.length ?? 0;
    input.current?.setSelectionRange(len, len);
  }, []);
  useEffect(() => {
    try { store.listDocuments().then(setRecentDocs).catch(() => {}); } catch { /* engine not ready */ }
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const c of registry.value) {
      if (c.hidden || !isEnabled(c)) continue;
      out.push({ id: c.id, title: c.title, group: c.category, keywords: c.keywords, shortcut: shortcutOf(c.id), run: () => runCommand(c.id, { fromPalette: true }) });
    }
    const tab = activeTab.peek();
    if (tab) {
      for (const r of tab.doc.flatten()) {
        out.push({ id: `layer:${r.node.id}`, title: `Select layer: ${r.node.name}`, group: 'Layers', keywords: r.node.type, run: () => selectLayer(tab, r.node.id) });
      }
    }
    for (const m of recentDocs) {
      out.push({
        id: `doc:${m.id}`, title: `Open: ${m.name}`, group: 'Documents', keywords: `${m.width} ${m.height} recent`,
        run: async () => {
          const open = documents.peek().findIndex((t) => t.doc.id === m.id);
          if (open >= 0) { activateDocument(open); return; }
          try {
            const doc = await store.loadDocument(m.id);
            if (doc) openDocument(doc); else toast(`${m.name} is no longer stored on this device`, 'error');
          } catch (e) { toast(errorText(e), 'error'); }
        },
      });
    }
    return out;
  }, [recentDocs]);

  const results = useMemo<Scored[]>(() => {
    const q = query.trim();
    if (!q) {
      const recent = recentCommands.value.map((id) => entries.find((e) => e.id === id)).filter((e): e is Entry => !!e)
        .map((e) => ({ ...e, group: 'Recent', score: 0, hits: [] }));
      const rest = entries.filter((e) => e.group !== 'Layers' && e.group !== 'Documents' && !recentCommands.value.includes(e.id))
        .map((e) => ({ ...e, score: 0, hits: [] }));
      return [...recent, ...rest];
    }
    const scored: Scored[] = [];
    for (const e of entries) {
      const t = fuzzyScore(q, e.title);
      if (t) { scored.push({ ...e, score: t.score, hits: t.hits }); continue; }
      const k = e.keywords ? fuzzyScore(q, e.keywords) : null;
      if (k && k.score > q.length * 4) scored.push({ ...e, score: k.score * 0.5, hits: [] });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 60);
    const groupBest = new Map<string, number>();
    for (const s of top) if (!groupBest.has(s.group)) groupBest.set(s.group, s.score);
    return top.sort((a, b) => (groupBest.get(b.group)! - groupBest.get(a.group)!) || b.score - a.score);
  }, [query, entries]);

  const grouped = useMemo(() => {
    const order = query.trim() ? Array.from(new Set(results.map((r) => r.group))) : GROUP_ORDER.filter((g) => results.some((r) => r.group === g));
    return order.map((g) => ({ group: g, items: results.filter((r) => r.group === g) }));
  }, [results, query]);
  const flat = grouped.flatMap((g) => g.items);

  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const runAt = (i: number) => {
    const e = flat[i];
    if (!e) return;
    paletteOpen.value = false;
    e.run();
    if (!e.id.startsWith('file.') && !e.id.startsWith('settings') && !e.id.startsWith('help') && !e.id.startsWith('view.network')) focusCanvas();
  };

  const suggestion = flat.length === 0 && query.trim() ? closest(query, entries.map((e) => e.title)) : null;
  let idx = -1;

  return (
    <div class="modal-layer palette-layer">
      <div class="modal-scrim" aria-hidden="true" />
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette" data-testid="palette">
        <div class="pal-input">
          <Icon name="search" size={18} />
          <input
            ref={input} value={query} placeholder="Search tools, layers, export..." aria-label="Search commands" data-testid="palette-input"
            role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={flat[index] ? `pal-${index}` : undefined}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(flat.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); runAt(index); }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
              else if (e.key === 'Tab') e.preventDefault();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div class="pal-list" id="pal-list" role="listbox" ref={list}>
          {grouped.map((g) => (
            <div key={g.group} class="pal-group" role="group" aria-label={g.group}>
              <div class="pal-group-title">{g.group}</div>
              {g.items.map((e) => {
                idx++;
                const i = idx;
                return (
                  <div
                    key={e.id + g.group} id={`pal-${i}`} data-idx={i} role="option" aria-selected={i === index}
                    class={`pal-item${i === index ? ' on' : ''}`} onPointerMove={() => { if (i !== index) setIndex(i); }}
                    onClick={() => runAt(i)}
                  >
                    <span class="pal-title"><Highlight text={e.title} hits={e.hits} /></span>
                    {e.shortcut && <kbd>{e.shortcut}</kbd>}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <div class="pal-empty">
              {suggestion ? (
                <>No match. Did you mean <button type="button" class="link" onClick={() => setQuery(suggestion)}>{suggestion}</button>?</>
              ) : 'No match.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
