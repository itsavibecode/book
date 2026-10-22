// Smaller modals: network log, settings, about, confirm. Plus the host that renders the stack.
import { APP_NAME, APP_VERSION } from '@/app/constants';
import { closeDocument } from '@/app/docs';
import { clearNetworkLog } from '@/app/network';
import { closeModal, confirmModal, documents, modals, networkLog, pixelGrid, surround, theme, toast, type ModalSpec, type SurroundKind, type ThemePref } from '@/app/state';
import { store } from '@/engine';
import { errorText, formatBytes } from '@/app/util';
import { ExportSheet } from './ExportSheet';
import { NewDocSheet } from './NewDocSheet';
import { Button, Segmented, Toggle } from './primitives/controls';
import { Modal } from './primitives/Modal';
import { tip } from './primitives/Tooltip';

function NetworkLogSheet({ top }: { top: boolean }) {
  const list = networkLog.value;
  const close = () => closeModal('network');
  return (
    <Modal
      title="Network log" onCancel={close} top={top} variant="sheet" testid="network-log" width={720}
      footer={<><span class="foot-note muted">{list.length} {list.length === 1 ? 'request' : 'requests'} since this page loaded</span><span class="spacer" /><Button onClick={clearNetworkLog}>Clear</Button><Button variant="primary" onClick={close}>Done</Button></>}
    >
      <p class="lede">{APP_NAME} makes no network requests of its own after loading. Anything listed here came from your browser or an extension.</p>
      {list.length === 0 ? (
        <p class="empty-note">No requests since the page loaded.</p>
      ) : (
        <div class="netlog" role="table" aria-label="Requests">
          <div class="net-row head" role="row"><span role="columnheader">Time</span><span role="columnheader">Type</span><span role="columnheader">Address</span><span role="columnheader">Size</span></div>
          {list.slice().reverse().map((e, i) => (
            <div class={`net-row${e.crossOrigin ? ' cross' : ''}`} role="row" key={i}>
              <span role="cell" class="tabular">{new Date(e.time).toLocaleTimeString()}</span>
              <span role="cell">{e.method} {e.type}</span>
              <span role="cell" class="net-url"><b>{e.origin}</b>{e.path}</span>
              <span role="cell" class="tabular">{e.bytes ? formatBytes(e.bytes) : '-'}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function SettingsDialog({ top }: { top: boolean }) {
  const close = () => closeModal('settings');
  const s = surround.value;
  const clearRecovery = async () => {
    const ok = await confirmModal({
      title: 'Clear recovery data?',
      body: `This closes every open document and deletes every document stored in this browser, including the Recent list. Files you exported or saved are not affected. This cannot be undone.`,
      confirmLabel: 'Delete everything', danger: true,
    });
    if (!ok) return;
    try {
      for (let i = documents.peek().length - 1; i >= 0; i--) await closeDocument(i);
      const all = await store.listDocuments();
      for (const m of all) await store.deleteDocument(m.id);
      await store.setOpenDocuments([]);
      toast('Recovery data cleared');
    } catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <Modal title="Settings" onCancel={close} top={top} testid="settings" width={520} footer={<Button variant="primary" onClick={close}>Done</Button>}>
      <div class="form-grid">
        <span class="fg-label">Theme</span>
        <Segmented<ThemePref> label="Theme" value={theme.value} onChange={(t) => { theme.value = t; }}
          options={[{ value: 'system', label: 'System', why: 'Follows your device setting' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        <span class="fg-label" {...tip('Canvas surround', 'The area around the picture. A neutral grey makes colour judgement easier, so it never follows the theme')}>Surround</span>
        <span class="inline">
          <Segmented<SurroundKind> label="Canvas surround" value={s.kind} onChange={(k) => { surround.value = { ...s, kind: k }; }}
            options={[{ value: 'light', label: 'Light' }, { value: 'mid', label: 'Mid' }, { value: 'dark', label: 'Dark' }, { value: 'custom', label: 'Custom' }]} />
          {s.kind === 'custom' && (
            <label class="chip-colour" {...tip('Custom surround colour')}>
              <span style={{ background: s.custom }} />
              <input type="color" class="sr-only" aria-label="Custom surround colour" value={s.custom} onInput={(e) => { surround.value = { kind: 'custom', custom: (e.currentTarget as HTMLInputElement).value }; }} />
            </label>
          )}
        </span>
        <span class="fg-label">Pixel grid</span>
        <Toggle label="Show pixel grid above 800%" checked={pixelGrid.value} onChange={(v) => { pixelGrid.value = v; }} why="Outlines each pixel when you zoom far in, for precise retouching" />
        <span class="fg-label">Storage</span>
        <span><Button variant="small" onClick={() => void clearRecovery()}>Clear recovery data</Button></span>
        <span class="fg-label">Version</span>
        <span class="tabular">{APP_NAME} v{APP_VERSION}</span>
      </div>
    </Modal>
  );
}

function AboutDialog({ top }: { top: boolean }) {
  const close = () => closeModal('about');
  return (
    <Modal title={`About ${APP_NAME}`} onCancel={close} top={top} testid="about" width={460} footer={<Button variant="primary" onClick={close}>Close</Button>}>
      <p class="lede"><b>{APP_NAME}</b> <span class="tabular">v{APP_VERSION}</span></p>
      <p>A browser image editor with layers, masks and selections. Everything happens on your device: no account, no upload, no tracking.</p>
      <p class="muted">MIT licence. Inspired by OpenShop.</p>
    </Modal>
  );
}

function ConfirmDialog({ spec, top }: { spec: Extract<ModalSpec, { kind: 'confirm' }>; top: boolean }) {
  return (
    <Modal
      title={spec.title} onCancel={() => spec.resolve(false)} top={top} testid="confirm" width={440}
      footer={<>
        <Button onClick={() => spec.resolve(false)} data-testid="confirm-cancel">{spec.cancelLabel ?? 'Cancel'}</Button>
        <Button variant={spec.danger ? 'danger' : 'primary'} onClick={() => spec.resolve(true)} data-testid="confirm-ok" data-autofocus>{spec.confirmLabel}</Button>
      </>}
    >
      <p>{spec.body}</p>
    </Modal>
  );
}

export function ModalHost() {
  const list = modals.value;
  return (
    <>
      {list.map((m, i) => {
        const top = i === list.length - 1;
        switch (m.kind) {
          case 'newdoc': return <NewDocSheet key="newdoc" top={top} />;
          case 'export': return <ExportSheet key="export" top={top} />;
          case 'network': return <NetworkLogSheet key="network" top={top} />;
          case 'settings': return <SettingsDialog key="settings" top={top} />;
          case 'about': return <AboutDialog key="about" top={top} />;
          case 'confirm': return <ConfirmDialog key={`confirm-${i}`} spec={m} top={top} />;
          default: return null;
        }
      })}
    </>
  );
}
