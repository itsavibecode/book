// Context bar: options for the current tool only. Every slider has a number field beside it.
// Text and shape options also apply to the active text / shape layer, so the bar doubles as a
// quick editor for the selected object. Colours are the exception: the foreground swatch only
// sets the colour of NEW text and shapes; a layer's own colour changes only through its chip.
// On desktop the bar must fit without scrolling: secondary options live in a More chip and
// hints hide themselves when space runs out.
import { useLayoutEffect, useRef } from 'preact/hooks';
import { commands as cmds, type RGBA } from '@/engine';
import { activeNode } from '@/app/layerOps';
import { activeTab, compact, docVersion, foreground, toast, toolId, toolOptions, type ColourTarget } from '@/app/state';
import { cssOf } from '@/app/colour';
import { shortcutOf } from '@/app/commands';
import { errorText } from '@/app/util';
import { fit, zoom100 } from '@/app/view';
import { fillSelectionNow } from '@/tools/fill';
import { alignActive } from '@/tools/move';
import { fontLabel, fontStack, TEXT_FONTS, TEXT_WEIGHTS, type PaintOptions, type ToolOptions } from '@/tools/options';
import { memberOf, groupOf, memberKey } from '@/tools/registry';
import type { AnyNode } from '@/engine';
import { IconButton, NumberField, Segmented, Select, SliderField, Toggle, Button } from './primitives/controls';
import { tip } from './primitives/Tooltip';
import { openColour } from './ColourPopover';
import { MoreChip } from './MoreChip';

function setOpt<K extends keyof ToolOptions>(k: K, patch: Partial<ToolOptions[K]>): void {
  const o = toolOptions.peek();
  toolOptions.value = { ...o, [k]: { ...o[k], ...patch } };
}

/** Applies a patch to the active node when it is of the given type (one undo step per control). */
function applyToActive(type: AnyNode['type'], patch: Partial<AnyNode>, key: string): void {
  const tab = activeTab.peek();
  const n = activeNode(tab);
  if (!tab || !n || n.type !== type || n.locked) return;
  try { tab.doc.history.push(cmds.setProps(tab.doc, n.id, patch, `ctx:${key}:${n.id}`)); } catch (e) { toast(errorText(e), 'error'); }
}

const Sep = () => <span class="vsep" aria-hidden="true" />;

function PaintBar({ k }: { k: 'brush' | 'eraser' }) {
  const o: PaintOptions = toolOptions.value[k];
  return (
    <>
      <span class="chip" {...tip('Round tip', 'A round brush tip. Hardness sets how soft its edge is')}>Round</span>
      <SliderField label="Size" value={o.size} min={1} max={500} unit="px" onChange={(v) => setOpt(k, { size: v })} why="Brush diameter. Press [ and ] to change it while painting" testid={`${k}-size`} sliderWidth={80} />
      <SliderField label="Hardness" value={o.hardness} min={0} max={100} unit="%" onChange={(v) => setOpt(k, { hardness: v })} why="Lower values give a softer, feathered edge" sliderWidth={56} />
      <SliderField label="Opacity" value={o.opacity} min={1} max={100} unit="%" onChange={(v) => setOpt(k, { opacity: v })} why="The most a single stroke can cover, however often you go over it" sliderWidth={56} />
      <SliderField label="Flow" value={o.flow} min={1} max={100} unit="%" onChange={(v) => setOpt(k, { flow: v })} why="How much each dab adds; low flow builds up gradually" sliderWidth={56} />
      <MoreChip why="Dab spacing and pen pressure" testid={`${k}-more`}>
        <div class="more-grid">
          <SliderField label="Spacing" value={o.spacing} min={1} max={200} unit="%" onChange={(v) => setOpt(k, { spacing: v })} why="Gap between dabs as a share of the size; higher values look dotted" sliderWidth={96} />
          <span class="ctl-label">Pen pressure changes</span>
          <Toggle label="Size" checked={o.pressureSize} onChange={(v) => setOpt(k, { pressureSize: v })} why="With a pen, pressing harder makes the stroke wider" />
          <Toggle label="Opacity" checked={o.pressureOpacity} onChange={(v) => setOpt(k, { pressureOpacity: v })} why="With a pen, pressing harder makes the stroke more solid" />
        </div>
      </MoreChip>
    </>
  );
}

function MoveBar() {
  void docVersion.value;
  const tab = activeTab.value;
  const n = activeNode(tab);
  const o = toolOptions.value.move;
  const align = (how: Parameters<typeof alignActive>[1]) => { if (tab && n) alignActive({ doc: tab.doc, id: n.id }, how); };
  return (
    <>
      <Toggle label="Auto-select layer" checked={o.autoSelect} onChange={(v) => setOpt('move', { autoSelect: v })} why="Click any object to pick its layer. Hold Ctrl for the same thing once" testid="auto-select" />
      <Sep />
      <span class="ctl-label">Align</span>
      <IconButton icon="alignLeft" label="Align left" why="Moves the layer to the left edge of the document" disabled={!n} onClick={() => align('left')} small />
      <IconButton icon="alignHCenter" label="Align centre" why="Centres the layer horizontally in the document" disabled={!n} onClick={() => align('hcenter')} small />
      <IconButton icon="alignRight" label="Align right" why="Moves the layer to the right edge of the document" disabled={!n} onClick={() => align('right')} small />
      <IconButton icon="alignTop" label="Align top" why="Moves the layer to the top edge of the document" disabled={!n} onClick={() => align('top')} small />
      <IconButton icon="alignVMiddle" label="Align middle" why="Centres the layer vertically in the document" disabled={!n} onClick={() => align('vmiddle')} small />
      <IconButton icon="alignBottom" label="Align bottom" why="Moves the layer to the bottom edge of the document" disabled={!n} onClick={() => align('bottom')} small />
    </>
  );
}

function SelectBar() {
  const o = toolOptions.value.select;
  return (
    <>
      <span class="ctl-label">Mode</span>
      <Segmented
        label="Selection mode" value={o.mode} onChange={(v) => setOpt('select', { mode: v })}
        options={[
          { value: 'replace', label: 'New', why: 'Each drag starts a new selection' },
          { value: 'add', label: 'Add', why: 'Adds to the selection. Shift at the start of a drag does this once' },
          { value: 'subtract', label: 'Subtract', why: 'Removes from the selection. Alt at the start of a drag does this once' },
          { value: 'intersect', label: 'Intersect', why: 'Keeps only the overlap. Shift+Alt does this once' },
        ]}
      />
      <Sep />
      <span class="hint">Shift draws a square or circle, Alt draws from the centre</span>
    </>
  );
}

function FillBar() {
  const o = toolOptions.value.fill;
  const pct = Math.round((o.tolerance / 255) * 100);
  return (
    <>
      <SliderField label="Tolerance" value={pct} min={0} max={100} unit="%" onChange={(v) => setOpt('fill', { tolerance: Math.round(v * 2.55) })} why="How different a colour can be and still get filled. 0% fills only the exact colour" sliderWidth={96} />
      <Toggle label="Contiguous" checked={o.contiguous} onChange={(v) => setOpt('fill', { contiguous: v })} why="On: fill only the connected area you click. Off: every matching pixel in the layer" />
      <Sep />
      <Button variant="small" onClick={fillSelectionNow} {...tip('Fill selection', 'Fills the selection (or the whole layer) with the foreground colour')}>Fill selection</Button>
    </>
  );
}

/** Colour chip that opens the colour popover for one target (a layer property or a swatch). */
export function ColourChip({ colour, label, why, target, testid }: { colour: RGBA | null; label: string; why: string; target: ColourTarget; testid?: string }) {
  return (
    <button
      type="button" class="chip-colour" aria-label={label} data-colour-chip data-testid={testid}
      onClick={(e) => openColour(target, e.currentTarget as HTMLElement)} {...tip(label, why)}
    >
      <span class={colour ? undefined : 'none-swatch'} style={colour ? { background: cssOf(colour) } : undefined} />
    </button>
  );
}

function TextBar() {
  void docVersion.value;
  const o = toolOptions.value.text;
  const set = (patch: Partial<ToolOptions['text']>, nodePatch: Record<string, unknown>, key: string) => {
    setOpt('text', patch);
    applyToActive('text', nodePatch as Partial<AnyNode>, key);
  };
  const n = activeNode(activeTab.value);
  const fontValue = n && n.type === 'text' ? fontLabel(n.font) : o.font;
  return (
    <>
      <Select label="Font" value={TEXT_FONTS.includes(fontValue) ? fontValue : o.font} width={150} why="Fonts installed on every common system, so your text looks the same elsewhere"
        options={TEXT_FONTS.map((f) => [f, f === 'system-ui' ? 'System UI' : f])}
        onChange={(f) => set({ font: f }, { font: fontStack(f) }, 'font')} />
      <NumberField label="Font size" value={n && n.type === 'text' ? n.size : o.size} min={1} max={2000} unit="px" onChange={(v) => set({ size: v }, { size: v }, 'size')} />
      <Select label="Weight" value={n && n.type === 'text' ? nearestWeight(n.weight) : o.weight} width={120}
        options={TEXT_WEIGHTS.map(([w, l]) => [w, l])} onChange={(w) => set({ weight: w }, { weight: w }, 'weight')} />
      <IconButton icon="italic" label="Italic" on={n && n.type === 'text' ? n.italic : o.italic} small
        onClick={() => { const v = !(n && n.type === 'text' ? n.italic : o.italic); set({ italic: v }, { italic: v }, 'italic'); }} />
      {n && n.type === 'text' ? (
        <ColourChip colour={n.color} label={`Text colour of ${n.name}`} why="Changes this layer's colour only" target={{ which: 'node', nodeId: n.id, prop: 'color' }} testid="ctx-text-colour" />
      ) : (
        <ColourChip colour={foreground.value} label="Colour for new text" why="New text uses the foreground colour" target={{ which: 'fg' }} testid="ctx-text-colour" />
      )}
      <Segmented label="Alignment" value={n && n.type === 'text' ? n.align : o.align} onChange={(a) => set({ align: a }, { align: a }, 'align')}
        options={[{ value: 'left', label: 'Align left', icon: 'textLeft' }, { value: 'center', label: 'Align centre', icon: 'textCenter' }, { value: 'right', label: 'Align right', icon: 'textRight' }]} />
      <Sep />
      <span class="hint">Click to type, click a text layer to edit it, Esc to finish</span>
    </>
  );
}

function nearestWeight(w: number): number {
  return TEXT_WEIGHTS.reduce((best, [x]) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), 400);
}

function ShapeBar() {
  void docVersion.value;
  const o = toolOptions.value.shape;
  const n = activeNode(activeTab.value);
  const shapeNode = n && n.type === 'shape' ? n : null;
  const showCorners = toolId.value === 'shapeRect' || shapeNode?.shape === 'rect';
  const radius = shapeNode && shapeNode.shape === 'rect' ? shapeNode.radius : o.radius;
  return (
    <>
      <Toggle label="Fill" checked={shapeNode ? !!shapeNode.fill : o.fillOn} why="Fills new shapes with the foreground colour; with a shape selected, turns its fill on or off"
        onChange={(v) => { setOpt('shape', { fillOn: v }); applyToActive('shape', { fill: v ? [...(shapeNode?.fill ?? foreground.peek())] as RGBA : null } as Partial<AnyNode>, 'fill'); }} />
      {shapeNode ? (
        <ColourChip colour={shapeNode.fill} label={`Fill colour of ${shapeNode.name}`} why="Changes this shape's fill only" target={{ which: 'node', nodeId: shapeNode.id, prop: 'fill' }} testid="ctx-fill-colour" />
      ) : (
        <ColourChip colour={foreground.value} label="Fill for new shapes" why="New shapes are filled with the foreground colour" target={{ which: 'fg' }} testid="ctx-fill-colour" />
      )}
      <Sep />
      <Toggle label="Stroke" checked={shapeNode ? !!shapeNode.stroke : o.strokeOn} why="Draws an outline around the shape"
        onChange={(v) => { setOpt('shape', { strokeOn: v }); applyToActive('shape', { stroke: v ? [...(shapeNode?.stroke ?? o.strokeColor)] as RGBA : null } as Partial<AnyNode>, 'stroke'); }} />
      {shapeNode ? (
        <ColourChip colour={shapeNode.stroke ?? o.strokeColor} label={`Stroke colour of ${shapeNode.name}`} why="Changes this shape's outline only" target={{ which: 'node', nodeId: shapeNode.id, prop: 'stroke' }} testid="ctx-stroke-colour" />
      ) : (
        <ColourChip colour={o.strokeColor} label="Stroke for new shapes" why="Outline colour of the next shapes you draw" target={{ which: 'strokeOption' }} testid="ctx-stroke-colour" />
      )}
      <SliderField label="Width" value={shapeNode ? shapeNode.strokeWidth : o.strokeWidth} min={0} max={200} unit="px" sliderWidth={56} why="Outline thickness"
        onChange={(v) => { setOpt('shape', { strokeWidth: v }); applyToActive('shape', { strokeWidth: v } as Partial<AnyNode>, 'strokeWidth'); }} />
      {showCorners && (
        <SliderField label="Corners" value={radius} min={0} max={500} unit="px" sliderWidth={56} why="Rounds the rectangle's corners" testid="ctx-corners"
          onChange={(v) => { setOpt('shape', { radius: v }); if (shapeNode?.shape === 'rect') applyToActive('shape', { radius: v } as Partial<AnyNode>, 'radius'); }} />
      )}
      <Sep />
      <span class="hint">Shift for a square or circle, Alt from the centre</span>
    </>
  );
}

function ViewBar({ zoomMode }: { zoomMode: boolean }) {
  const o = toolOptions.value.zoom;
  return (
    <>
      {zoomMode && (
        <Segmented label="Zoom direction" value={o.mode} onChange={(m) => setOpt('zoom', { mode: m })}
          options={[{ value: 'in', label: 'Zoom in', why: 'Clicks zoom in. Hold Alt to zoom out' }, { value: 'out', label: 'Zoom out', why: 'Clicks zoom out. Hold Alt to zoom in' }]} />
      )}
      <Button variant="small" onClick={() => fit()} {...tip('Fit on screen', 'Shows the whole picture', shortcutOf('view.fit'))}>Fit</Button>
      <Button variant="small" onClick={() => zoom100()} {...tip('Actual size', 'One document pixel per screen pixel', shortcutOf('view.actual'))}>100%</Button>
    </>
  );
}

function EyedropperBar() {
  const o = toolOptions.value.eyedropper;
  return (
    <>
      <span class="ctl-label">Sample</span>
      <Segmented label="Sample from" value={o.sample} onChange={(s) => setOpt('eyedropper', { sample: s })}
        options={[{ value: 'all', label: 'All layers', why: 'Picks the colour you see' }, { value: 'active', label: 'Active layer', why: 'Picks from the selected layer only, ignoring layers above it' }]} />
      <Sep />
      <span class="hint">Alt-click sets the background colour</span>
    </>
  );
}

export function ContextBar() {
  const id = toolId.value;
  const m = memberOf(id);
  const g = groupOf(id);
  let body = null;
  switch (id) {
    case 'move': body = <MoveBar />; break;
    case 'selectRect': case 'selectEllipse': body = <SelectBar />; break;
    case 'brush': body = <PaintBar k="brush" />; break;
    case 'eraser': body = <PaintBar k="eraser" />; break;
    case 'fill': body = <FillBar />; break;
    case 'text': body = <TextBar />; break;
    case 'shapeRect': case 'shapeEllipse': body = <ShapeBar />; break;
    case 'hand': body = <ViewBar zoomMode={false} />; break;
    case 'zoom': body = <ViewBar zoomMode />; break;
    case 'eyedropper': body = <EyedropperBar />; break;
    default: body = null;
  }
  const ref = useRef<HTMLDivElement>(null);
  // Hints are optional: hide them whenever the bar would otherwise overflow (desktop never scrolls).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      el.classList.remove('tight');
      if (!compact.peek() && el.scrollWidth > el.clientWidth + 1) el.classList.add('tight');
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return (
    <div ref={ref} class="ctxbar no-scrollbar" role="toolbar" aria-label={`${m.name} options`} data-testid="context-bar">
      <b class="ctx-title" {...tip(m.name, m.hint, memberKey(m, g))}>{m.name}</b>
      {body}
    </div>
  );
}
