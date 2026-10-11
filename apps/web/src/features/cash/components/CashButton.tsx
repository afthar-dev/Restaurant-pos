import { Banknote } from 'lucide-react';
import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { useCan } from '@/shared/session/store';
import { ErrorNote, secondaryButton } from '@/shared/ui';

// The dialog (tabs, reason chips, manager approval) loads on first tap, so the staff entry
// chunk stays small.
const CashDialog = lazy(() => import('./CashDialog').then((m) => ({ default: m.CashDialog })));

/** A dialog whose download failed (offline, or the app was updated) says so instead of crashing. */
class ChunkBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="fixed inset-x-4 bottom-4 z-50 rounded-lg bg-surface p-4 shadow-overlay"
      >
        <ErrorNote message="The cash screen could not load. Reload the page and try again." />
        <button
          type="button"
          className={`${secondaryButton} mt-2 min-h-11`}
          onClick={this.props.onClose}
        >
          Close
        </button>
      </div>
    );
  }
}

/** "Cash" opens the cash in / out / drop dialog. Shown to whoever takes payments or closes the day. */
export function CashButton({ className }: { className?: string }) {
  const canTakePayments = useCan('payment.take');
  const canCloseDay = useCan('day.openClose');
  const [open, setOpen] = useState(false);
  if (!canTakePayments && !canCloseDay) return null;
  return (
    <>
      <button
        type="button"
        className={className ?? `${secondaryButton} min-h-11`}
        onClick={() => setOpen(true)}
      >
        <Banknote aria-hidden="true" />
        Cash
      </button>
      {open && (
        <ChunkBoundary onClose={() => setOpen(false)}>
          <Suspense fallback={null}>
            <CashDialog onClose={() => setOpen(false)} />
          </Suspense>
        </ChunkBoundary>
      )}
    </>
  );
}
