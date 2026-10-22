// Export sheet: format cards, scale, quality, size estimate, preview, the loss list, filename.
// Closes only via X, Cancel or Export (house rule).
import { useEffect, useRef, useState } from 'preact/hooks';
import { estimateSize, exportImage, lossList, saveAs, saveProject, type ExportFormat, type LossItem } from '@/io';
import { activeTab, closeModal, toast } from '@/app/state';
import { errorText, formatBytes } from '@/app/util';
import { Button, NumberField, Select, Slider, Toggle } from './primitives/controls';
import { Modal } from './primitives/Modal';
import { tip } from './primitives/Tooltip';

type Fmt = ExportFormat | 'photochop';

const FORMATS: Array<{ id: Fmt; name: string; line: string; ext: string; mime: string }> = [
  { id: 'png', name: 'PNG', line: 'Lossless, keeps transparency', ext: '.png', mime: 'image/png' },
  { id: 'jpeg', name: 'JPEG', line: 'Photos, no transparency', ext: '.jpg', mime: 'image/jpeg' },
  { id: 'webp', name: 'WebP', line: 'Small files, keeps transparency', ext: '.webp', mime: 'image/webp' },
  { id: 'photochop', name: 'PhotoChop project', line: 'Everything stays editable', ext: '.photochop', mime: 'application/x-photochop' },
];

const SCALES: Array<[number, string]> = [[0.25, '25%'], [0.5, '50%'], [1, '100%'], [2, '200%'], [3, '300%'], [4, '400%']];

export function ExportSheet({ top }: { top: boolean }) {
  const tab = activeTab.value;
  const [fmt, setFmt] = useState<Fmt>('png');
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(90);
  const [alsoProject, setAlsoProject] = useState(false);
  const [base, setBase] = useState(tab?.doc.name ?? 'Untitled');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const cancel = () => closeModal('export');

  const f = FORMATS.find((x) => x.id === fmt)!;
  const isImage = fmt !== 'photochop';

  useEffect(() => {
    if (!tab || !isImage) { setEstimate(null); return; }
    setEstimate(null);
    let alive = true;
    const t = setTimeout(() => {
      try {
        estimateSize(tab.doc, tab.compositor, { format: fmt as ExportFormat, scale, quality: quality / 100 })
          .then((n) => { if (alive) setEstimate(n); }).catch(() => {});
      } catch { /* engine not ready */ }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [fmt, scale, quality, tab]);

  useEffect(() => {
    const c = preview.current;
    if (!c || !tab) return;
    const g = c.getContext('2d')!;
    const box = { w: 280, h: 170 };
    const s = Math.min(box.w / tab.doc.width, box.h / tab.doc.height);
    const w = Math.max(1, Math.round(tab.doc.width * s)), h = Math.max(1, Math.round(tab.doc.height * s));
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    g.clearRect(0, 0, c.width, c.height);
    if (fmt === 'jpeg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); }
    try {
      tab.compositor.composite(tab.doc);
      g.imageSmoothingQuality = 'high';
      g.drawImage(tab.compositor.canvas as CanvasImageSource, 0, 0, c.width, c.height);
    } catch { /* compositor not ready */ }
  }, [fmt, tab]);

  if (!tab) return null;
  let losses: LossItem[] = [];
  try { losses = lossList(tab.doc, fmt); } catch { losses = []; }
  const outW = Math.max(1, Math.round(tab.doc.width * scale)), outH = Math.max(1, Math.round(tab.doc.height * scale));
  const cleanBase = base.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'Untitled';

  const run = async () => {
    setBusy(true);
    try {
      if (fmt === 'photochop') {
        const blob = await saveProject(tab.doc, tab.compositor);
        const h = await saveAs(blob, `${cleanBase}.photochop`, 'PhotoChop project', { 'application/x-photochop': ['.photochop'] });
        tab.fileHandle = h ?? tab.fileHandle;
        toast(`Saved ${h?.name ?? `${cleanBase}.photochop`}`);
      } else {
        const res = await exportImage(tab.doc, tab.compositor, { format: fmt, scale, quality: quality / 100 });
        const name = `${cleanBase}${f.ext}`;
        const accept: Record<string, string[]> = { [f.mime]: fmt === 'jpeg' ? ['.jpg', '.jpeg'] : [f.ext] };
        const h = await saveAs(res.blob, name, `${f.name} image`, accept);
        toast(`Exported ${h?.name ?? name}`);
        if (alsoProject) {
          const blob = await saveProject(tab.doc, tab.compositor);
          await saveAs(blob, `${cleanBase}.photochop`, 'PhotoChop project', { 'application/x-photochop': ['.photochop'] });
        }
      }
      closeModal('export');
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast(`Export failed: ${errorText(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export" onCancel={cancel} top={top} variant="sheet" testid="export-sheet" width={760}
      footer={<>
        <span class="foot-note muted">{isImage ? `${outW} x ${outH} px${estimate !== null ? `, about ${formatBytes(estimate)}` : ''}` : 'Layers, text, shapes and masks stay editable'}</span>
        <span class="spacer" />
        <Button onClick={cancel}>Cancel</Button>
        <Button variant="primary" disabled={busy} onClick={() => void run()} data-testid="export-go">{busy ? 'Exporting...' : 'Export'}</Button>
      </>}
    >
      <div class="export-grid">
        <div class="export-left">
          <div class="fmt-cards" role="radiogroup" aria-label="Format">
            {FORMATS.map((x) => (
              <button
                key={x.id} type="button" role="radio" aria-checked={x.id === fmt} class={`fmt-card${x.id === fmt ? ' on' : ''}`}
                data-testid={`fmt-${x.id}`} onClick={() => setFmt(x.id)}
              >
                <span class="fmt-name">{x.name}</span>
                <span class="fmt-line">{x.line}</span>
              </button>
            ))}
          </div>
          <div class="form-grid">
            <label class="fg-label" for="ex-name">File name</label>
            <span class="fname">
              <input id="ex-name" class="field" value={base} onInput={(e) => setBase((e.currentTarget as HTMLInputElement).value)} data-testid="export-name" />
              <span class="muted">{f.ext}</span>
            </span>
            {isImage && (
              <>
                <span class="fg-label" {...tip('Scale', 'Export larger or smaller than the document without changing it')}>Scale</span>
                <span class="inline">
                  <Select<number> label="Scale" value={scale} options={SCALES} onChange={setScale} width={96} />
                  <span class="muted tabular">{outW} x {outH} px</span>
                </span>
              </>
            )}
            {(fmt === 'jpeg' || fmt === 'webp') && (
              <>
                <span class="fg-label" {...tip('Quality', 'Lower quality gives smaller files with more visible artefacts')}>Quality</span>
                <span class="inline">
                  <Slider value={quality} min={1} max={100} label="Quality" width={140} onInput={setQuality} />
                  <NumberField value={quality} min={1} max={100} unit="%" label="Quality value" onChange={setQuality} />
                </span>
              </>
            )}
            {isImage && (
              <>
                <span class="fg-label">Size</span>
                <span class="tabular" data-testid="export-estimate">{estimate === null ? 'Estimating...' : `About ${formatBytes(estimate)}`}</span>
                <span class="fg-label" />
                <Toggle label="Also save the project" checked={alsoProject} onChange={setAlsoProject} why="Saves a .photochop file next to the image, so you can keep editing later" />
              </>
            )}
          </div>
        </div>
        <div class="export-right">
          <div class="export-preview checker"><canvas ref={preview} aria-label="Preview" /></div>
          <div class="loss" data-testid="loss-list">
            <h3>{losses.length ? 'What this format loses' : 'What this format keeps'}</h3>
            {losses.length ? <ul>{losses.map((l, i) => <li key={i}>{l.text}</li>)}</ul> : <p>Nothing is lost.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
