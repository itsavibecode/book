// New document sheet: name, size (with presets), background.
import { useState } from 'preact/hooks';
import { newDocument, nextUntitledName } from '@/app/docs';
import { closeModal } from '@/app/state';
import { Button, NumberField, Segmented, Select } from './primitives/controls';
import { Modal } from './primitives/Modal';
import { MAX_DOC_SIDE, TEMPLATES } from './templates';

export function NewDocSheet({ top }: { top: boolean }) {
  const [name, setName] = useState(nextUntitledName());
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [bg, setBg] = useState<'white' | 'transparent'>('white');
  const preset = TEMPLATES.find((t) => t.w === w && t.h === h)?.name ?? 'custom';
  const cancel = () => closeModal('newdoc');
  const create = () => {
    if (newDocument(name, w, h, bg === 'white' ? [255, 255, 255, 255] : null)) closeModal('newdoc');
  };
  return (
    <Modal
      title="New document" onCancel={cancel} top={top} testid="newdoc" width={440}
      footer={<><Button onClick={cancel}>Cancel</Button><Button variant="primary" onClick={create} data-testid="newdoc-create">Create</Button></>}
    >
      <form class="form-grid" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <label class="fg-label" for="nd-name">Name</label>
        <input id="nd-name" class="field" value={name} data-autofocus onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} data-testid="newdoc-name" />
        <span class="fg-label">Preset</span>
        <Select<string>
          label="Preset" value={preset} width={240}
          options={[['custom', 'Custom size'], ...TEMPLATES.map((t) => [t.name, `${t.name} (${t.w} x ${t.h})`] as [string, string])]}
          onChange={(p) => { const t = TEMPLATES.find((x) => x.name === p); if (t) { setW(t.w); setH(t.h); if (/^Untitled/.test(name)) setName(t.name); } }}
        />
        <span class="fg-label">Width</span>
        <NumberField label="Width" value={w} min={1} max={MAX_DOC_SIDE} unit="px" onChange={setW} />
        <span class="fg-label">Height</span>
        <NumberField label="Height" value={h} min={1} max={MAX_DOC_SIDE} unit="px" onChange={setH} />
        <span class="fg-label">Background</span>
        <Segmented<'white' | 'transparent'> label="Background" value={bg} onChange={setBg}
          options={[{ value: 'white', label: 'White', why: 'Starts with a white Background layer' }, { value: 'transparent', label: 'Transparent', why: 'No background layer; empty areas stay see-through in PNG and WebP' }]} />
        <button type="submit" class="sr-only" tabIndex={-1}>Create</button>
      </form>
    </Modal>
  );
}
