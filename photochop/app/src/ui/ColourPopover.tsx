// Colour popover. It edits exactly one target: the foreground or background swatch, the
// stroke colour for new shapes, or one colour property of one layer (Fill / Stroke / Text
// colour chips). Node edits are mergeable setProps commands on that node only; picking a
// foreground colour never touches an existing layer.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { commands as cmds, type AnyNode, type RGBA } from '@/engine';
import { cssOf, hexToRgba, hsvToRgb, rgbaToHex, rgbToHsv, sameColour } from '@/app/colour';
import {
  activeTab, background, colourPopover, compact, docVersion, foreground, recentColours, toast, toolOptions,
  type ColourTarget,
} from '@/app/state';
import { clamp, errorText } from '@/app/util';
import { Icon } from './icons';
import { NumberField, Slider } from './primitives/controls';

const SV_W = 232, SV_H = 150, HUE_H = 14;
let session = 0;

export function ColourPopover() {
  const t = colourPopover.value;
  if (!t) return null;
  const key = t.which === 'node' ? `node:${t.nodeId}:${t.prop}` : t.which;
  return <ColourPicker key={key} target={t} />;
}

/** Opens the popover for a target, anchored to the element that was clicked. */
export function openColour(target: ColourTarget, el?: Element | null): void {
  const r = el?.getBoundingClientRect();
  colourPopover.value = { ...target, anchor: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : undefined } as ColourTarget;
}

interface Bound { value: RGBA; title: string; set(c: RGBA): void; alive: boolean }

function useTarget(t: ColourTarget, mergeKey: string): Bound {
  void docVersion.value;
  if (t.which === 'fg') return { value: foreground.value, title: 'Foreground colour', set: (c) => { foreground.value = c; }, alive: true };
  if (t.which === 'bg') return { value: background.value, title: 'Background colour', set: (c) => { background.value = c; }, alive: true };
  if (t.which === 'strokeOption') {
    return {
      value: toolOptions.value.shape.strokeColor, title: 'Stroke colour for new shapes', alive: true,
      set: (c) => { const o = toolOptions.peek(); toolOptions.value = { ...o, shape: { ...o.shape, strokeColor: c } }; },
    };
  }
  if (t.which !== 'node') return { value: foreground.value, title: 'Colour', set: () => {}, alive: false };
  const tab = activeTab.value;
  const n = tab?.doc.getNode(t.nodeId);
  const propName = t.prop === 'fill' ? 'Fill colour' : t.prop === 'stroke' ? 'Stroke colour' : 'Text colour';
  if (!tab || !n) return { value: foreground.value, title: propName, set: () => {}, alive: false };
  const cur = (n as unknown as Record<string, RGBA | null>)[t.prop] ?? foreground.value;
  return {
    value: cur, title: `${propName} of ${n.name}`, alive: true,
    set: (c) => {
      try { tab.doc.history.push(cmds.setProps(tab.doc, n.id, { [t.prop]: [c[0], c[1], c[2], c[3]] } as Partial<AnyNode>, mergeKey)); }
      catch (e) { toast(errorText(e), 'error'); }
    },
  };
}

function ColourPicker({ target }: { target: ColourTarget }) {
  const mergeKey = useRef(`colour-pop:${++session}`).current;
  const b = useTarget(target, mergeKey);
  const c = b.value;
  const start = useRef<RGBA>(c);
  const [hsv, setHsv] = useState(() => rgbToHsv(c[0], c[1], c[2]));
  const [hex, setHex] = useState(rgbaToHex(c));
  const sv = useRef<HTMLCanvasElement>(null);
  const hue = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const hexRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const close = () => {
    const now = b.value;
    if (!sameColour(now, start.current)) {
      recentColours.value = [now, ...recentColours.peek().filter((x) => !sameColour(x, now))].slice(0, 16);
    }
    colourPopover.value = null;
  };

  // The layer went away (undo, delete): close instead of editing nothing.
  useEffect(() => { if (!b.alive) colourPopover.value = null; }, [b.alive]);

  // Keep the hex field in step with outside changes (undo, eyedropper) unless the user is typing in it.
  useEffect(() => {
    if (document.activeElement !== hexRef.current) setHex(rgbaToHex(c));
  }, [c[0], c[1], c[2]]);

  const setFromHsv = (h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    const [r, g, bl] = hsvToRgb(h, s, v);
    const next: RGBA = [r, g, bl, b.value[3]];
    b.set(next);
    setHex(rgbaToHex(next));
  };
  const setAlpha = (a: number) => { const x = b.value; b.set([x[0], x[1], x[2], Math.round((a / 100) * 255)]); };

  useEffect(() => {
    const cv = sv.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = SV_W * dpr; cv.height = SV_H * dpr;
    const g = cv.getContext('2d')!;
    const [r, gg, bl] = hsvToRgb(hsv[0], 1, 1);
    g.fillStyle = `rgb(${r},${gg},${bl})`;
    g.fillRect(0, 0, cv.width, cv.height);
    const white = g.createLinearGradient(0, 0, cv.width, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)'); white.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = white; g.fillRect(0, 0, cv.width, cv.height);
    const black = g.createLinearGradient(0, 0, 0, cv.height);
    black.addColorStop(0, 'rgba(0,0,0,0)'); black.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = black; g.fillRect(0, 0, cv.width, cv.height);
  }, [hsv[0]]);

  useEffect(() => {
    const cv = hue.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = SV_W * dpr; cv.height = HUE_H * dpr;
    const g = cv.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, cv.width, 0);
    for (let i = 0; i <= 6; i++) { const [r, gg, bl] = hsvToRgb((i * 60) % 360, 1, 1); grad.addColorStop(i / 6, `rgb(${r},${gg},${bl})`); }
    g.fillStyle = grad; g.fillRect(0, 0, cv.width, cv.height);
  }, []);

  // Position next to the control that opened it (fixed top edge, so it never jumps), and put
  // the caret in the hex field so typing a hex works straight away.
  useLayoutEffect(() => {
    const el = root.current;
    const a = target.anchor;
    if (el && a && !compact.peek()) {
      const w = el.offsetWidth, h = el.offsetHeight;
      const left = clamp(a.left, 8, window.innerWidth - w - 8);
      let top = a.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 6);
      setPos({ left, top });
    }
  }, []);
  // Focus once the popover is visible (a visibility:hidden field cannot take focus).
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (focused.current || (target.anchor && !compact.peek() && !pos)) return;
    focused.current = true;
    hexRef.current?.focus();
    hexRef.current?.select();
  }, [pos]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (root.current && !root.current.contains(t) && !t.closest('.swatches') && !t.closest('[data-colour-chip]')) close();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const t = setTimeout(() => document.addEventListener('pointerdown', down, true), 0);
    document.addEventListener('keydown', key, true);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); };
  }, []);

  const dragOn = (el: HTMLElement, fn: (x: number, y: number) => void) => (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const apply = (ev: PointerEvent) => fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
    apply(e);
    const move = (ev: PointerEvent) => apply(ev);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const alpha = Math.round((c[3] / 255) * 100);
  const anchored = !!target.anchor && !compact.value;
  const style = anchored ? (pos ? { left: `${pos.left}px`, top: `${pos.top}px`, bottom: 'auto' } : { visibility: 'hidden' as const, left: '0px', top: '0px', bottom: 'auto' }) : undefined;
  return (
    <div ref={root} class={`colour-pop${compact.value ? ' compact' : ''}`} style={style} role="dialog" aria-label={b.title} data-testid="colour-popover">
      <div class="cp-head">
        <span class="cp-title" data-testid="colour-title">{b.title}</span>
        <span class="cp-preview" style={{ background: cssOf(c) }} />
        <button type="button" class="ib sm" aria-label="Close colour picker" onClick={close}><Icon name="close" /></button>
      </div>
      <div
        class="sv" tabIndex={0} role="slider" aria-label="Saturation and brightness" aria-valuetext={`saturation ${Math.round(hsv[1] * 100)}%, brightness ${Math.round(hsv[2] * 100)}%`}
        onPointerDown={(e) => dragOn(e.currentTarget as HTMLElement, (x, y) => setFromHsv(hsv[0], x, 1 - y))(e)}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02;
          if (e.key === 'ArrowLeft') setFromHsv(hsv[0], clamp(hsv[1] - d, 0, 1), hsv[2]);
          else if (e.key === 'ArrowRight') setFromHsv(hsv[0], clamp(hsv[1] + d, 0, 1), hsv[2]);
          else if (e.key === 'ArrowUp') setFromHsv(hsv[0], hsv[1], clamp(hsv[2] + d, 0, 1));
          else if (e.key === 'ArrowDown') setFromHsv(hsv[0], hsv[1], clamp(hsv[2] - d, 0, 1));
          else return;
          e.preventDefault();
        }}
      >
        <canvas ref={sv} style={{ width: `${SV_W}px`, height: `${SV_H}px` }} />
        <span class="sv-knob" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }} />
      </div>
      <div
        class="hue" tabIndex={0} role="slider" aria-label="Hue" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv[0])}
        onPointerDown={(e) => dragOn(e.currentTarget as HTMLElement, (x) => setFromHsv(Math.min(359.9, x * 360), hsv[1], hsv[2]))(e)}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 30 : 5;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setFromHsv((hsv[0] - d + 360) % 360, hsv[1], hsv[2]);
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setFromHsv((hsv[0] + d) % 360, hsv[1], hsv[2]);
          else return;
          e.preventDefault();
        }}
      >
        <canvas ref={hue} style={{ width: `${SV_W}px`, height: `${HUE_H}px` }} />
        <span class="hue-knob" style={{ left: `${(hsv[0] / 360) * 100}%` }} />
      </div>
      <div class="cp-row">
        <label class="cp-label" for="cp-hex">Hex</label>
        <input
          id="cp-hex" ref={hexRef} class="field cp-hex" value={hex} spellcheck={false} maxLength={9} data-testid="colour-hex"
          onInput={(e) => setHex((e.currentTarget as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
          onBlur={() => {
            const v = hexToRgba(hex, b.value[3]);
            if (!v) { setHex(rgbaToHex(b.value)); return; }
            b.set(v);
            setHsv(rgbToHsv(v[0], v[1], v[2]));
            setHex(rgbaToHex(v));
          }}
        />
      </div>
      <div class="cp-row">
        <span class="cp-label">Alpha</span>
        <Slider value={alpha} min={0} max={100} label="Alpha" width={110} onInput={setAlpha} />
        <NumberField value={alpha} min={0} max={100} unit="%" label="Alpha value" onChange={setAlpha} />
      </div>
      <div class="cp-recent" aria-label="Recent colours">
        {recentColours.value.length === 0 && <span class="cp-recent-empty">Colours you pick show up here</span>}
        {recentColours.value.map((rc, i) => (
          <button
            key={i} type="button" class="cp-chip" aria-label={`Use ${rgbaToHex(rc)}`} style={{ background: cssOf(rc) }}
            onClick={() => { b.set(rc); setHsv(rgbToHsv(rc[0], rc[1], rc[2])); setHex(rgbaToHex(rc)); }}
          />
        ))}
      </div>
    </div>
  );
}
