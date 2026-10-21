// Small control primitives: Button, IconButton, Toggle, Select, Slider, NumberField, Segmented.
// Every slider is paired with a keyboard-editable NumberField by the callers (house rule).
import type { ButtonHTMLAttributes, ComponentChildren, CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { parseNumberInput, clamp } from '@/app/util';
import { Icon, type IconName } from '../icons';
import { tip, type TipPlace } from './Tooltip';

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'small'; children?: ComponentChildren }) {
  const { variant, class: cls, ...rest } = props;
  return <button type="button" {...rest} class={`btn${variant ? ` ${variant}` : ''}${cls ? ` ${cls}` : ''}`} />;
}

export interface IconButtonProps {
  icon: IconName;
  label: string;
  /** Why you would press it (tooltip second line). */
  why?: string;
  kbd?: string;
  place?: TipPlace;
  on?: boolean;
  small?: boolean;
  disabled?: boolean;
  testid?: string;
  onClick?(e: MouseEvent): void;
  onContextMenu?(e: MouseEvent): void;
  class?: string;
}

export function IconButton({ icon, label, why, kbd, place, on, small, disabled, testid, onClick, onContextMenu, class: cls }: IconButtonProps) {
  return (
    <button
      type="button" class={`ib${small ? ' sm' : ''}${on ? ' on' : ''}${cls ? ` ${cls}` : ''}`} aria-label={label} aria-pressed={on === undefined ? undefined : on}
      disabled={disabled} data-testid={testid} onClick={onClick} onContextMenu={onContextMenu} {...tip(label, why, kbd, place)}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Toggle({ label, checked, onChange, why, testid }: { label: string; checked: boolean; onChange(v: boolean): void; why?: string; testid?: string }) {
  return (
    <label class="toggle" {...(why ? tip(label, why) : {})}>
      <input type="checkbox" checked={checked} data-testid={testid} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span class="sw" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string | number>({ value, options, onChange, label, why, width, testid }: {
  value: T; options: Array<[T, string]>; onChange(v: T): void; label: string; why?: string; width?: number; testid?: string;
}) {
  return (
    <select
      class="field" aria-label={label} value={String(value)} data-testid={testid}
      style={width ? { width: `${width}px` } : undefined} {...(why ? tip(label, why) : {})}
      onChange={(e) => {
        const raw = (e.currentTarget as HTMLSelectElement).value;
        const hit = options.find(([v]) => String(v) === raw);
        if (hit) onChange(hit[0]);
      }}
    >
      {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
    </select>
  );
}

export function Slider({ value, min, max, step = 1, onInput, label, width = 110, testid }: {
  value: number; min: number; max: number; step?: number; onInput(v: number): void; label: string; width?: number; testid?: string;
}) {
  const pct = ((clamp(value, min, max) - min) / (max - min || 1)) * 100;
  return (
    <input
      type="range" class="slider" min={min} max={max} step={step} value={value} aria-label={label} data-testid={testid}
      style={{ width: `${width}px`, '--pct': `${pct}%` } as CSSProperties}
      onInput={(e) => onInput(Number((e.currentTarget as HTMLInputElement).value))}
    />
  );
}

/**
 * Numeric field that accepts '50%', '+10', '-5', '24px', '*2'. Parses on Enter or blur,
 * clamps to [min, max], Up/Down arrows step (Shift = x10). Width fits the widest value.
 */
export function NumberField({ value, min, max, step = 1, unit = '', decimals = 0, onChange, label, chars, testid }: {
  value: number; min: number; max: number; step?: number; unit?: string; decimals?: number; onChange(v: number): void;
  label: string; chars?: number; testid?: string;
}) {
  const fmt = (v: number) => (decimals ? v.toFixed(decimals) : String(Math.round(v)));
  const [text, setText] = useState(fmt(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(fmt(value)); }, [value]);
  const widest = Math.max(fmt(max).length, fmt(min).length, chars ?? 0);
  // Digits are tabular, so 1ch per character; the unit sits in the right padding.
  const width = `${widest + 0.5}ch + ${unit ? 36 : 18}px`;
  const commit = (raw: string) => {
    const v = parseNumberInput(raw, value, unit);
    editing.current = false;
    if (v === null) { setText(fmt(value)); return; }
    const c = clamp(decimals ? Number(v.toFixed(decimals)) : Math.round(v), min, max);
    setText(fmt(c));
    if (c !== value) onChange(c);
  };
  return (
    <span class={`numfield${unit ? ' has-unit' : ''}`}>
      <input
        class="field num" inputMode="decimal" aria-label={label} value={text} data-testid={testid} style={{ width: `calc(${width})` }}
        onFocus={(e) => { editing.current = true; (e.currentTarget as HTMLInputElement).select(); }}
        onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
        onBlur={(e) => commit((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          const el = e.currentTarget as HTMLInputElement;
          if (e.key === 'Enter') { commit(el.value); el.select(); }
          else if (e.key === 'Escape') { editing.current = false; setText(fmt(value)); el.blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const c = clamp(value + d, min, max);
            setText(fmt(c));
            onChange(c);
          }
        }}
      />
      {unit && <span class="unit">{unit}</span>}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: string; icon?: IconName; why?: string }>; onChange(v: T): void; label: string;
}) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button" role="radio" aria-checked={o.value === value} class={o.value === value ? 'on' : ''} key={o.value}
          aria-label={o.icon ? o.label : undefined} onClick={() => onChange(o.value)} {...(o.icon || o.why ? tip(o.label, o.why) : {})}
        >
          {o.icon ? <Icon name={o.icon} /> : o.label}
        </button>
      ))}
    </div>
  );
}

/** Label + slider + number field, the standard numeric row. */
export function SliderField(props: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange(v: number): void;
  sliderWidth?: number; why?: string; testid?: string; mergeHint?: never;
}) {
  const { label, value, min, max, step, unit, onChange, sliderWidth, why, testid } = props;
  return (
    <span class="ctl">
      <span class="ctl-label" {...(why ? tip(label, why) : {})}>{label}</span>
      <Slider value={value} min={min} max={max} step={step} onInput={onChange} label={label} width={sliderWidth} testid={testid ? `${testid}-slider` : undefined} />
      <NumberField value={value} min={min} max={max} step={step} unit={unit} onChange={onChange} label={`${label} value`} testid={testid} />
    </span>
  );
}
