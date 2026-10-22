// Startup: head tags, theme, layout, network log, commands, shortcuts, settings, then the
// recovery path (documents that were open when the page was last closed come back).
import { store } from '@/engine';
import { flushAll, openDocument, persistOpenList } from './docs';
import { initDropAndPaste } from './files';
import { applyHead, registerServiceWorker } from './head';
import { initLayout } from './layout';
import { initNetworkLog } from './network';
import { loadRecentCommands } from './recent';
import { registerAllCommands } from './registerCommands';
import { loadSettings, readCachedTheme } from './settings';
import { initShortcuts } from './shortcuts';
import { activeDocIndex, booted, documents, engineError, now, openModal, theme } from './state';
import { installTestHook } from './testhook';
import { initTheme } from './theme';
import { errorText } from './util';

/** Synchronous part: everything the first render needs. */
export function bootSync(): void {
  applyHead();
  initNetworkLog();
  theme.value = readCachedTheme();
  initTheme();
  initLayout();
  registerAllCommands();
  initShortcuts();
  initDropAndPaste();
  installTestHook();
  registerServiceWorker();
  setInterval(() => { now.value = Date.now(); }, 1000);
  const flush = () => { void flushAll(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

/** Async part: settings and recovery. */
export async function bootAsync(): Promise<void> {
  try {
    await loadSettings();
    await loadRecentCommands();
  } catch (e) {
    console.warn('Settings unavailable', e);
  }
  try {
    const ids = await store.getOpenDocuments();
    for (const id of ids) {
      try {
        const doc = await store.loadDocument(id);
        if (doc) openDocument(doc, { restore: true });
      } catch (e) {
        console.warn('Could not restore document', id, e);
      }
    }
    if (documents.peek().length) activeDocIndex.value = 0;
    if (documents.peek().length !== ids.length) persistOpenList();
  } catch (e) {
    engineError.value = errorText(e);
  }
  booted.value = true;
  // Home-screen shortcut: /photochop/?action=new opens the New document sheet.
  if (new URLSearchParams(location.search).get('action') === 'new') openModal({ kind: 'newdoc' });
}
