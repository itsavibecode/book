// Global keyboard shortcuts, driven by the command registry. Nothing fires while typing in a
// field, or while a modal or the palette is open (they own the keyboard then).
import { matchesKey, registry, runCommand, isEnabled } from './commands';
import { modals, paletteOpen } from './state';
import { isTypingTarget } from './util';

/** The focusable viewport canvas, registered by the Viewport component. */
export const canvasRef: { current: HTMLElement | null; onKey: ((e: KeyboardEvent) => boolean) | null } = { current: null, onKey: null };

export function canvasFocused(): boolean {
  return !!canvasRef.current && document.activeElement === canvasRef.current;
}

export function focusCanvas(): void {
  canvasRef.current?.focus({ preventScroll: true });
}

export function initShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (isTypingTarget(e.target)) return;
    if (modals.peek().length || paletteOpen.peek()) return;
    const onCanvas = canvasFocused();
    if (onCanvas && canvasRef.onKey && canvasRef.onKey(e)) { e.preventDefault(); return; }
    const focusIsNeutral = onCanvas || document.activeElement === document.body || document.activeElement === null;
    for (const c of registry.peek()) {
      if (!c.keys) continue;
      if (c.canvasOnly && !onCanvas) continue;
      if (!c.keys.some((k) => matchesKey(k, e))) continue;
      // Tab moves focus between controls unless the canvas (or nothing) has focus.
      if (e.key === 'Tab' && !focusIsNeutral) return;
      // Plain keys on a focused button would also click it; let Space/Enter through.
      e.preventDefault();
      if (isEnabled(c)) runCommand(c.id);
      return;
    }
  });
}
