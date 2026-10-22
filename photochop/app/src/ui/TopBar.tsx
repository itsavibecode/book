// Top bar: logo, document tabs, search, undo/redo, On device badge, Menu, Export.
import { useState } from 'preact/hooks';
import { APP_NAME, APP_VERSION } from '@/app/constants';
import { runCommand, shortcutOf } from '@/app/commands';
import { activateDocument, closeDocument } from '@/app/docs';
import { openPalette } from '@/app/registerCommands';
import {
  activeDocIndex, activeTab, compact, crossOriginCount, docVersion, documents, openModal, saveVersion, type DocTab,
} from '@/app/state';
import { Icon } from './icons';
import { MainMenu } from './MainMenu';
import { PopupMenu } from './primitives/PopupMenu';
import { tip } from './primitives/Tooltip';

export function Logo({ withVersion = true }: { withVersion?: boolean }) {
  return (
    <div class="logo">
      <svg class="logo-mark" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="2" y="4" width="18" height="3.6" rx="1.8" fill="var(--acc)" />
        <rect x="2" y="9.2" width="18" height="3.6" rx="1.8" fill="var(--fg)" opacity="0.85" />
        <rect x="2" y="14.4" width="18" height="3.6" rx="1.8" fill="var(--fg)" opacity="0.45" />
      </svg>
      <span class="logo-name">{APP_NAME}</span>
      {withVersion && <small class="logo-ver">v{APP_VERSION}</small>}
    </div>
  );
}

function isDirty(t: DocTab): boolean {
  try { return t.autosave.state !== 'saved'; } catch { return false; }
}

function DocTabs() {
  void docVersion.value;
  void saveVersion.value;
  const list = documents.value;
  return (
    <div class="doctabs no-scrollbar" role="tablist" aria-label="Open documents">
      {list.map((t, i) => (
        <div
          key={t.key} role="tab" aria-selected={i === activeDocIndex.value} tabIndex={0} data-testid="doc-tab"
          class={`doctab${i === activeDocIndex.value ? ' on' : ''}`}
          onClick={() => activateDocument(i)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateDocument(i); } }}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); void closeDocument(i); } }}
          onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
          {...tip(t.doc.name, `${t.doc.width} x ${t.doc.height}${isDirty(t) ? '. Saving changes on this device' : ''}`)}
        >
          <span class="doctab-name">{t.doc.name}</span>
          {isDirty(t) && <span class="dirty-dot" aria-label="Unsaved changes" />}
          <button
            type="button" class="doctab-x" aria-label={`Close ${t.doc.name}`}
            onClick={(e) => { e.stopPropagation(); void closeDocument(i); }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <button type="button" class="doctab add" aria-label="New document" data-testid="new-tab" onClick={() => openModal({ kind: 'newdoc' })} {...tip('New document', 'Start a blank canvas in a new tab')}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

/** Compact: the document name is a dropdown listing the open documents. */
function DocSwitcher() {
  void docVersion.value;
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const tab = activeTab.value;
  const list = documents.value;
  return (
    <>
      <button type="button" class="docswitch" data-testid="doc-switch" onClick={(e) => setMenu((e.currentTarget as HTMLElement).getBoundingClientRect())} aria-haspopup="menu">
        <span class="doctab-name">{tab?.doc.name ?? 'No document'}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {menu && (
        <PopupMenu
          x={menu.left} y={menu.bottom + 4} label="Documents" onClose={() => setMenu(null)}
          entries={[
            ...list.map((t, i) => ({ label: t.doc.name, checked: i === activeDocIndex.value, run: () => activateDocument(i) })),
            { kind: 'sep' as const },
            { label: 'New document', run: () => openModal({ kind: 'newdoc' }) },
            ...(tab ? [{ label: `Close ${tab.doc.name}`, run: () => closeDocument(activeDocIndex.peek()) }] : []),
          ]}
        />
      )}
    </>
  );
}

export function OnDeviceBadge() {
  const n = crossOriginCount.value;
  return (
    <button
      type="button" class={`badge${n ? ' warn' : ''}`} data-testid="on-device" onClick={() => openModal({ kind: 'network' })}
      {...tip(n ? `${n} requests to other sites` : 'On device', n ? 'Something in your browser contacted another site. Click to see what.' : 'Nothing has been sent anywhere since this page loaded. Click to see the network log.')}
    >
      <span class="dot" aria-hidden="true" />
      {n ? `${n} external` : 'On device'}
    </button>
  );
}

export function TopBar() {
  void docVersion.value;
  const tab = activeTab.value;
  const h = tab?.doc.history;
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  const isCompact = compact.value;
  const undoLabel = h && h.canUndo ? `Undo ${h.labels[h.cursor - 1] ?? ''}`.trim() : 'Nothing to undo';
  const redoLabel = h && h.canRedo ? `Redo ${h.labels[h.cursor] ?? ''}`.trim() : 'Nothing to redo';
  return (
    <header class="topbar" data-testid="topbar">
      <Logo withVersion={!isCompact} />
      {isCompact ? <DocSwitcher /> : <DocTabs />}
      {isCompact ? (
        <button type="button" class="ib" aria-label="Search" data-testid="search" onClick={() => openPalette()}><Icon name="search" /></button>
      ) : (
        <button type="button" class="search-field" data-testid="search" onClick={() => openPalette()} aria-label="Search tools, layers and commands">
          <Icon name="search" size={16} />
          <span class="sf-text">Search tools, layers, export...</span>
          <kbd>{shortcutOf('help.palette')}</kbd>
        </button>
      )}
      <div class="acts">
        <button type="button" class="ib" aria-label={undoLabel} disabled={!h?.canUndo} data-testid="undo" onClick={() => runCommand('edit.undo')} {...tip(undoLabel, undefined, shortcutOf('edit.undo'))}><Icon name="undo" /></button>
        <button type="button" class="ib" aria-label={redoLabel} disabled={!h?.canRedo} data-testid="redo" onClick={() => runCommand('edit.redo')} {...tip(redoLabel, undefined, shortcutOf('edit.redo'))}><Icon name="redo" /></button>
        {!isCompact && <OnDeviceBadge />}
        <button
          type="button" class={isCompact ? 'ib' : 'btn ghost menu-btn'} aria-label="Menu" aria-haspopup="menu" data-testid="menu-button"
          onClick={(e) => setMenuAt(menuAt ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}
        >
          {isCompact ? <Icon name="menu" /> : 'Menu'}
        </button>
        <button type="button" class="btn primary" aria-label="Export" disabled={!tab} data-testid="export-button" onClick={() => runCommand('file.export')} {...tip('Export', 'Save a PNG, JPEG or WebP copy, or the editable project', shortcutOf('file.export'))}>
          {isCompact ? <Icon name="export" size={18} /> : 'Export'}
        </button>
      </div>
      {menuAt && <MainMenu anchor={menuAt} onClose={() => setMenuAt(null)} />}
    </header>
  );
}
