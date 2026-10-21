// Compact layout detection: narrow windows OR a coarse primary pointer (touch) get the bottom
// dock + sheet layout. Sets data-layout on <html> so CSS can follow without JS.
import { COMPACT_MAX_WIDTH } from './constants';
import { compact } from './state';

export function initLayout(): void {
  const narrow = window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH}px)`);
  const coarse = window.matchMedia('(pointer: coarse)');
  const apply = () => {
    compact.value = narrow.matches || coarse.matches;
    document.documentElement.dataset.layout = compact.value ? 'compact' : 'desktop';
  };
  narrow.addEventListener('change', apply);
  coarse.addEventListener('change', apply);
  apply();
}
