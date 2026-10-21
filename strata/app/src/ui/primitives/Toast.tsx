// Toasts: top-centre, passive confirmations only, auto-dismiss after 3 s, at most 3 stacked.
import { toasts } from '@/app/state';

export function ToastHost() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => <div key={t.id} class={`toast${t.tone === 'error' ? ' error' : ''}`} data-testid="toast">{t.text}</div>)}
    </div>
  );
}
