// Start screen: "What will you make?", New / Open, templates, Recent documents.
import { useEffect, useState } from 'preact/hooks';
import { store, type DocumentMeta } from '@/engine';
import { APP_NAME, APP_TAGLINE } from '@/app/constants';
import { activateDocument, newDocument, openDocument } from '@/app/docs';
import { openPicker } from '@/app/files';
import { confirmModal, documents, engineError, openModal, resolvedTheme, toast } from '@/app/state';
import { toggleTheme } from '@/app/theme';
import { errorText, relTime } from '@/app/util';
import { Icon } from './icons';
import { tip } from './primitives/Tooltip';
import { TEMPLATES, type Template } from './templates';
import { Logo, OnDeviceBadge } from './TopBar';

function TemplateCard({ t }: { t: Template }) {
  const max = 64;
  const s = Math.min(max / t.w, max / t.h);
  return (
    <button
      type="button" class="tpl" data-testid={`template-${t.name}`}
      onClick={() => newDocument(t.name, t.w, t.h, [255, 255, 255, 255])} {...tip(t.name, `${t.note ?? ''}. White ${t.w} x ${t.h} px canvas`)}
    >
      <span class="tpl-shape-box"><span class="tpl-shape" style={{ width: `${Math.round(t.w * s)}px`, height: `${Math.round(t.h * s)}px` }} /></span>
      <span class="tpl-name">{t.name}</span>
      <span class="tpl-size tabular">{t.w} x {t.h}</span>
    </button>
  );
}

async function openRecent(m: DocumentMeta): Promise<void> {
  const i = documents.peek().findIndex((t) => t.doc.id === m.id);
  if (i >= 0) { activateDocument(i); return; }
  try {
    const doc = await store.loadDocument(m.id);
    if (doc) openDocument(doc);
    else toast(`${m.name} is no longer stored on this device`, 'error');
  } catch (e) {
    toast(`Could not open ${m.name}: ${errorText(e)}`, 'error');
  }
}

export function StartScreen() {
  const [recent, setRecent] = useState<DocumentMeta[] | null>(null);
  const load = () => {
    try { store.listDocuments().then((l) => setRecent([...l].sort((a, b) => b.updatedAt - a.updatedAt))).catch(() => setRecent([])); } catch { setRecent([]); }
  };
  useEffect(load, []);

  const remove = async (m: DocumentMeta) => {
    const ok = await confirmModal({
      title: `Remove ${m.name}?`, body: 'This deletes the copy stored in this browser. Files you exported or saved elsewhere are not affected. This cannot be undone.',
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    try { await store.deleteDocument(m.id); } catch (e) { toast(errorText(e), 'error'); }
    load();
  };

  return (
    <div class="start" data-testid="start-screen">
      <header class="start-top">
        <Logo />
        <span class="spacer" />
        <OnDeviceBadge />
        <button type="button" class="ib" aria-label="Switch theme" onClick={toggleTheme} {...tip(resolvedTheme.value === 'dark' ? 'Light theme' : 'Dark theme', 'Switches the interface colours; the picture is not affected')}>
          <Icon name={resolvedTheme.value === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button type="button" class="ib" aria-label="Settings" onClick={() => openModal({ kind: 'settings' })} {...tip('Settings')}><Icon name="settings" /></button>
      </header>
      <main class="start-main">
        <section class="start-hero">
          <h1>What will you make?</h1>
          <p class="muted">{APP_NAME}: {APP_TAGLINE}</p>
        </section>
        {engineError.value && <p class="start-error" role="alert">The editor could not start: {engineError.value}</p>}
        <section class="start-primary">
          <button type="button" class="big-card primary-card" data-testid="start-new" onClick={() => openModal({ kind: 'newdoc' })}>
            <Icon name="plus" size={24} />
            <span class="bc-title">New</span>
            <span class="bc-sub">Blank canvas of any size</span>
          </button>
          <button type="button" class="big-card" data-testid="start-open" onClick={openPicker}>
            <Icon name="folderOpen" size={24} />
            <span class="bc-title">Open</span>
            <span class="bc-sub">PNG, JPEG, WebP, GIF or a PhotoChop project, or drop files anywhere</span>
          </button>
        </section>
        <section class="start-section">
          <h2>Templates</h2>
          <div class="tpl-grid" data-testid="template-grid">
            {TEMPLATES.map((t) => <TemplateCard key={t.name} t={t} />)}
          </div>
        </section>
        <section class="start-section">
          <h2>Recent</h2>
          {recent === null ? <p class="muted">Loading...</p> : recent.length === 0 ? (
            <p class="muted">Nothing yet. Everything you make is kept in this browser and shows up here.</p>
          ) : (
            <div class="recent-grid">
              {recent.map((m) => (
                <div class="recent-card" key={m.id} data-testid="recent-card">
                  <button type="button" class="recent-open" onClick={() => void openRecent(m)} aria-label={`Open ${m.name}`}>
                    <span class="recent-thumb checker">{m.thumbnail ? <img src={m.thumbnail} alt="" /> : <Icon name="image" size={24} />}</span>
                    <span class="recent-name">{m.name}</span>
                    <span class="recent-meta tabular">{m.width} x {m.height}</span>
                    <span class="recent-meta">edited {relTime(m.updatedAt)}</span>
                  </button>
                  <button type="button" class="ib sm recent-x" aria-label={`Remove ${m.name}`} onClick={() => void remove(m)} {...tip('Remove from this device', 'Deletes the stored copy of this document')}>
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <p class="start-note">
          Nothing leaves your device. <button type="button" class="link" onClick={() => openModal({ kind: 'network' })}>See the network log</button>
        </p>
      </main>
    </div>
  );
}
