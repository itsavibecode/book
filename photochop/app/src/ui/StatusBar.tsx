// Status bar: document facts, tool readout, pointer position, save state, network counter.
import { activeTab, networkCount, now, openModal, pointerDoc, saveVersion, toolId, toolOptions, type DocTab } from '@/app/state';
import { memberOf } from '@/tools/registry';
import { relTime } from '@/app/util';
import { tip } from './primitives/Tooltip';

const DOT = ' · ';

export function saveStateInfo(tab: DocTab | null): { text: string; tone: 'ok' | 'busy' | 'warn' | 'error' } {
  void saveVersion.value;
  void now.value;
  if (!tab) return { text: '', tone: 'ok' };
  let state: string, savedAt = 0;
  try { state = tab.autosave.state; savedAt = tab.autosave.savedAt; } catch { return { text: 'Not saved', tone: 'warn' }; }
  if (state === 'saving') return { text: 'Saving...', tone: 'busy' };
  if (state === 'dirty') return { text: 'Unsaved changes', tone: 'warn' };
  if (state === 'error') return { text: 'Could not save', tone: 'error' };
  return { text: savedAt ? `Saved on this device${DOT}${relTime(savedAt, now.value)}` : 'Saved on this device', tone: 'ok' };
}

export function SaveState({ tab }: { tab: DocTab | null }) {
  const s = saveStateInfo(tab);
  if (!s.text) return null;
  return (
    <span class={`save-state ${s.tone}`} data-testid="save-state" {...tip(s.text, 'Your work is kept in this browser automatically, so closing the tab or reloading loses nothing')}>
      {s.text}
    </span>
  );
}

function toolReadout(): string {
  const id = toolId.value;
  const m = memberOf(id);
  const o = toolOptions.value;
  if (id === 'brush' || id === 'eraser') return `${m.name} ${o[id].size} px`;
  if (id === 'text') return `${m.name} ${o.text.size} px`;
  return m.name;
}

export function StatusBar() {
  const tab = activeTab.value;
  const p = pointerDoc.value;
  const n = networkCount.value;
  return (
    <footer class="statusbar" data-testid="statusbar">
      {tab && <span>{tab.doc.width} x {tab.doc.height}{DOT}sRGB{DOT}8-bit</span>}
      <span>{toolReadout()}</span>
      <span class="coords">{p ? `X ${p.x} Y ${p.y}` : ''}</span>
      <span class="spacer" />
      <SaveState tab={tab} />
      <button type="button" class="status-link" data-testid="network-count" onClick={() => openModal({ kind: 'network' })} {...tip('Network log', 'Every request this page made since it loaded. PhotoChop itself makes none', undefined, 'top')}>
        {n} network {n === 1 ? 'request' : 'requests'}
      </button>
    </footer>
  );
}
