import { BellRing, CircleCheck, Info, X } from 'lucide-react';
import { useNotifications, type Toast } from './store';

const TONE: Record<Toast['tone'], { className: string; icon: typeof Info }> = {
  success: { className: 'border-green-200 bg-green-50 text-green-900', icon: CircleCheck },
  info: { className: 'border-border bg-surface text-text', icon: Info },
  warning: { className: 'border-amber-300 bg-amber-50 text-amber-950', icon: BellRing },
};

function Stack({ toasts, position }: { toasts: Toast[]; position: 'top' | 'bottom' }) {
  const dismiss = useNotifications((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-3 z-60 mx-auto flex max-w-md flex-col gap-2 ${position === 'top' ? 'top-3' : 'bottom-20 lg:bottom-4'}`}
    >
      {toasts.map((t) => {
        const { className, icon: Icon } = TONE[t.tone];
        return (
          <div
            key={t.id}
            className={`flex animate-slide-up items-center gap-3 rounded-lg border px-4 py-3 font-medium shadow-overlay ${className}`}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <p className="flex-1">{t.text}</p>
            <button
              type="button"
              aria-label="Dismiss"
              className="flex size-8 items-center justify-center rounded-md opacity-70 hover:opacity-100"
              onClick={() => dismiss(t.id)}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Rendered once in the app shell. Warnings sit at the top, everything else at the bottom. */
export function Toaster() {
  const toasts = useNotifications((s) => s.toasts);
  return (
    <>
      <Stack position="top" toasts={toasts.filter((t) => t.tone === 'warning')} />
      <Stack position="bottom" toasts={toasts.filter((t) => t.tone !== 'warning')} />
    </>
  );
}
