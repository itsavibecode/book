// Inspector: properties of the active layer (or of the document when nothing is active).
// Every change is a setProps command with a mergeKey, so scrubbing a slider is one undo step.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { BLEND_MODES_IMPLEMENTED, BLEND_MODE_LABELS, TILE, type AnyNode, type BlendMode, type DocumentLike, type RasterNode, type RGBA, type ShapeNode, type TextNode } from '@/engine';
import { activeNode, renameDocument, setLayerProps } from '@/app/layerOps';
import { activeTab, docVersion, gestureActive, surround, type DocTab, type SurroundKind } from '@/app/state';
import { fontLabel, fontStack, TEXT_FONTS, TEXT_WEIGHTS } from '@/tools/options';
import { Icon } from './icons';
import { NumberField, Segmented, Select, Slider, Toggle } from './primitives/controls';
import { tip } from './primitives/Tooltip';
import { ColourChip } from './ContextBar';

function Row({ label, why, children }: { label: string; why?: string; children: ComponentChildren }) {
  return (
    <div class="insp-row">
      <span class="insp-label" {...(why ? tip(label, why, undefined, 'left') : {})}>{label}</span>
      <div class="insp-ctl">{children}</div>
    </div>
  );
}

/** Size of the painted pixels of a raster layer, clipped to the document (not the 256 px tile grid). */
function contentBounds(doc: DocumentLike, n: RasterNode): { w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const T = TILE;
  n.tiles.forEach((buf, tx, ty) => {
    const ox = tx * T + n.x, oy = ty * T + n.y;
    // Skip tiles that cannot widen the current box or lie outside the document.
    if (ox >= doc.width || oy >= doc.height || ox + T <= 0 || oy + T <= 0) return;
    if (ox >= x0 && oy >= y0 && ox + T <= x1 && oy + T <= y1) return;
    for (let y = 0; y < T; y++) {
      const dy = oy + y;
      if (dy < 0 || dy >= doc.height) continue;
      const row = y * T * 4;
      for (let x = 0; x < T; x++) {
        if (buf[row + x * 4 + 3] === 0) continue;
        const dx = ox + x;
        if (dx < 0 || dx >= doc.width) continue;
        if (dx < x0) x0 = dx;
        if (dx + 1 > x1) x1 = dx + 1;
        if (dy < y0) y0 = dy;
        if (dy + 1 > y1) y1 = dy + 1;
      }
    }
  });
  return x1 > x0 ? { w: x1 - x0, h: y1 - y0 } : null;
}

/** Content size readout, recomputed shortly after edits settle (never during a stroke). */
function RasterSize({ tab, n }: { tab: DocTab; n: RasterNode }) {
  const v = docVersion.value;
  const busy = gestureActive.value;
  const [size, setSize] = useState<{ w: number; h: number } | null | undefined>(undefined);
  useEffect(() => {
    if (busy) return;
    const t = setTimeout(() => { try { setSize(contentBounds(tab.doc, n)); } catch { setSize(null); } }, 200);
    return () => clearTimeout(t);
  }, [n.id, v, busy]);
  return <span class="tabular" data-testid="raster-size">{size === undefined ? '...' : size ? `${size.w} x ${size.h} px` : 'Empty'}</span>;
}

function TextProps({ tab, n }: { tab: DocTab; n: TextNode }) {
  const set = (patch: Partial<TextNode>, key: string) => setLayerProps(tab, n.id, patch as Partial<AnyNode>, `insp:${key}:${n.id}`);
  const font = fontLabel(n.font);
  return (
    <>
      <Row label="Font">
        <Select label="Font" value={TEXT_FONTS.includes(font) ? font : 'system-ui'} options={TEXT_FONTS.map((f) => [f, f === 'system-ui' ? 'System UI' : f])} onChange={(f) => set({ font: fontStack(f) }, 'font')} width={150} />
      </Row>
      <Row label="Size">
        <NumberField label="Font size" value={n.size} min={1} max={2000} unit="px" onChange={(v) => set({ size: v }, 'size')} />
      </Row>
      <Row label="Weight">
        <Select label="Weight" value={TEXT_WEIGHTS.reduce((b, [w]) => (Math.abs(w - n.weight) < Math.abs(b - n.weight) ? w : b), 400)} options={TEXT_WEIGHTS} onChange={(w) => set({ weight: w }, 'weight')} width={110} />
      </Row>
      <Row label="Style">
        <button type="button" class={`ib sm${n.italic ? ' on' : ''}`} aria-label="Italic" aria-pressed={n.italic} onClick={() => set({ italic: !n.italic }, 'italic')} {...tip('Italic')}><Icon name="italic" /></button>
        <ColourChip colour={n.color} label={`Text colour of ${n.name}`} why="Changes this layer's colour only" target={{ which: 'node', nodeId: n.id, prop: 'color' }} testid="insp-text-colour" />
        <Segmented label="Alignment" value={n.align} onChange={(a) => set({ align: a }, 'align')}
          options={[{ value: 'left', label: 'Align left', icon: 'textLeft' }, { value: 'center', label: 'Align centre', icon: 'textCenter' }, { value: 'right', label: 'Align right', icon: 'textRight' }]} />
      </Row>
      <Row label="Leading" why="Space between lines, as a share of the font size">
        <NumberField label="Line height" value={Math.round(n.lineHeight * 100)} min={50} max={400} unit="%" onChange={(v) => set({ lineHeight: v / 100 }, 'lineHeight')} />
      </Row>
      <Row label="Tracking" why="Extra space between letters; negative values tighten">
        <NumberField label="Letter spacing" value={n.letterSpacing} min={-200} max={500} unit="px" onChange={(v) => set({ letterSpacing: v }, 'letterSpacing')} chars={4} />
      </Row>
      <Row label="Box" why="Point text grows as you type; a box wraps lines at a fixed width">
        <Toggle label="Wrap in a box" checked={n.width !== null} onChange={(v) => set({ width: v ? Math.max(40, Math.round(tab.doc.nodeBounds(n.id)?.w ?? 300)) : null }, 'width')} />
        {n.width !== null && <NumberField label="Box width" value={n.width} min={8} max={20000} unit="px" onChange={(v) => set({ width: v }, 'boxWidth')} />}
      </Row>
    </>
  );
}

function ShapeProps({ tab, n }: { tab: DocTab; n: ShapeNode }) {
  const set = (patch: Partial<ShapeNode>, key: string) => setLayerProps(tab, n.id, patch as Partial<AnyNode>, `insp:${key}:${n.id}`);
  return (
    <>
      <Row label="Fill">
        <Toggle label="On" checked={!!n.fill} onChange={(v) => set({ fill: v ? (n.stroke ? [...n.stroke] as RGBA : [0, 0, 0, 255]) : null }, 'fillOn')} />
        {n.fill && <ColourChip colour={n.fill} label={`Fill colour of ${n.name}`} why="Changes this shape's fill only" target={{ which: 'node', nodeId: n.id, prop: 'fill' }} testid="insp-fill-colour" />}
      </Row>
      <Row label="Stroke">
        <Toggle label="On" checked={!!n.stroke} onChange={(v) => set({ stroke: v ? [0, 0, 0, 255] : null }, 'strokeOn')} />
        {n.stroke && <ColourChip colour={n.stroke} label={`Stroke colour of ${n.name}`} why="Changes this shape's outline only" target={{ which: 'node', nodeId: n.id, prop: 'stroke' }} testid="insp-stroke-colour" />}
        {n.stroke && <NumberField label="Stroke width" value={n.strokeWidth} min={0} max={500} unit="px" onChange={(v) => set({ strokeWidth: v }, 'strokeWidth')} />}
      </Row>
      {n.shape === 'rect' && (
        <Row label="Corners" why="Rounds the rectangle's corners">
          <NumberField label="Corner radius" value={n.radius} min={0} max={Math.round(Math.min(n.w, n.h) / 2)} unit="px" onChange={(v) => set({ radius: v }, 'radius')} />
        </Row>
      )}
      <Row label="Size">
        <NumberField label="Width" value={n.w} min={1} max={30000} unit="px" onChange={(v) => set({ w: v }, 'w')} />
        <NumberField label="Height" value={n.h} min={1} max={30000} unit="px" onChange={(v) => set({ h: v }, 'h')} />
      </Row>
      <Row label="Position">
        <NumberField label="X" value={Math.round(n.x)} min={-30000} max={30000} unit="px" onChange={(v) => set({ x: v }, 'x')} />
        <NumberField label="Y" value={Math.round(n.y)} min={-30000} max={30000} unit="px" onChange={(v) => set({ y: v }, 'y')} />
      </Row>
    </>
  );
}

function DocumentProps({ tab }: { tab: DocTab }) {
  const s = surround.value;
  return (
    <div class="insp" data-testid="inspector">
      <div class="ph"><h2 class="ph-title">Document</h2><span class="spacer" /><span class="caption">sRGB 8-bit</span></div>
      <Row label="Name">
        <input class="field" style={{ width: '100%' }} aria-label="Document name" defaultValue={tab.doc.name} key={tab.doc.name}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
          onBlur={(e) => renameDocument(tab, (e.currentTarget as HTMLInputElement).value)} />
      </Row>
      <Row label="Size"><span class="tabular">{tab.doc.width} x {tab.doc.height} px</span></Row>
      <Row label="Colour"><span>sRGB, 8 bits per channel</span></Row>
      <Row label="Surround" why="The grey around the picture. Neutral grey judges colour best; it never changes with the theme">
        <Select<SurroundKind> label="Canvas surround" value={s.kind} width={110}
          options={[['light', 'Light'], ['mid', 'Mid grey'], ['dark', 'Dark'], ['custom', 'Custom']]} onChange={(k) => { surround.value = { ...s, kind: k }; }} />
        {s.kind === 'custom' && (
          <label class="chip-colour" {...tip('Custom surround colour')}>
            <span style={{ background: s.custom }} />
            <input type="color" class="sr-only" aria-label="Custom surround colour" value={s.custom} onInput={(e) => { surround.value = { kind: 'custom', custom: (e.currentTarget as HTMLInputElement).value }; }} />
          </label>
        )}
      </Row>
    </div>
  );
}

export function Inspector() {
  void docVersion.value;
  const tab = activeTab.value;
  if (!tab) return null;
  const n = activeNode(tab);
  if (!n) return <DocumentProps tab={tab} />;
  const set = (patch: Partial<AnyNode>, key: string) => setLayerProps(tab, n.id, patch, `insp:${key}:${n.id}`);
  const typeLabel = n.type === 'raster' ? 'Pixels' : n.type === 'text' ? 'Text' : n.type === 'shape' ? (n.shape === 'rect' ? 'Rectangle' : 'Ellipse') : 'Group';
  const opacity = Math.round(n.opacity * 100);
  return (
    <div class="insp" data-testid="inspector">
      <div class="ph"><h2 class="ph-title insp-name" title={n.name}>{n.name}</h2><span class="spacer" /><span class="caption">{typeLabel}</span></div>
      <Row label="Opacity" why="How see-through the whole layer is, without changing its pixels">
        <Slider value={opacity} min={0} max={100} label="Opacity" width={96} onInput={(v) => set({ opacity: v / 100 }, 'opacity')} testid="opacity-slider" />
        <NumberField value={opacity} min={0} max={100} unit="%" label="Opacity value" onChange={(v) => set({ opacity: v / 100 }, 'opacity')} />
      </Row>
      <Row label="Blend" why="How this layer mixes with the layers below it">
        <Select<BlendMode> label="Blend mode" value={BLEND_MODES_IMPLEMENTED.includes(n.blend) ? n.blend : 'normal'} width={150}
          options={BLEND_MODES_IMPLEMENTED.map((m) => [m, BLEND_MODE_LABELS[m]])} onChange={(m) => set({ blend: m }, 'blend')} />
      </Row>
      <Row label="Lock" why="Protects the layer from painting, moving and deleting">
        <Toggle label={n.locked ? 'Locked' : 'Unlocked'} checked={n.locked} onChange={(v) => set({ locked: v }, 'locked')} />
      </Row>
      {n.type === 'text' && <TextProps tab={tab} n={n} />}
      {n.type === 'shape' && <ShapeProps tab={tab} n={n} />}
      {n.type === 'raster' && (
        <>
          <Row label="Position">
            <NumberField label="X" value={Math.round(n.x)} min={-30000} max={30000} unit="px" onChange={(v) => set({ x: v }, 'x')} />
            <NumberField label="Y" value={Math.round(n.y)} min={-30000} max={30000} unit="px" onChange={(v) => set({ y: v }, 'y')} />
          </Row>
          <Row label="Size" why="Size of the painted area inside the document"><RasterSize tab={tab} n={n} /></Row>
        </>
      )}
      {n.type === 'group' && <Row label="Contains"><span>{n.children.length} {n.children.length === 1 ? 'layer' : 'layers'}</span></Row>}
    </div>
  );
}
