import { useNotifications, type Toast } from './store';

const TONE_CLASS: Record<Toast['tone'], string> = {
  success: 'bg-emerald-800 text-white',
  info: 'bg-slate-800 text-white',
  warning: 'bg-amber-500 text-amber-950 font-semibold',
};

function Stack({ toasts, position }: { toasts: Toast[]; position: 'top' | 'bottom' }) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-3 z-30 flex flex-col gap-2 ${position === 'top' ? 'top-3' : 'bottom-3'}`}
    >
      {toasts.map((t) => (
        <p
          key={t.id}
          className={`rounded-lg px-4 py-3 font-medium shadow-lg ${TONE_CLASS[t.tone]}`}
        >
          {t.text}
        </p>
      ))}
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
