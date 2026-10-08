import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonClass } from './styles';
import { useReturnFocus } from './useReturnFocus';

/**
 * "Are you sure?" for actions that cannot be undone. The confirm button names the action
 * ("Void bill 12"), and Cancel has focus first so a stray Enter does nothing harmful.
 * Render it only while it should be open.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Extra content, such as an error note. */
  children?: ReactNode;
}) {
  useReturnFocus();
  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-slate-950/45" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-slide-up flex-col gap-4 rounded-2xl bg-surface p-5 shadow-overlay outline-none">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
              <TriangleAlert aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <AlertDialog.Title className="text-lg font-semibold text-text">
                {title}
              </AlertDialog.Title>
              {description ? (
                <AlertDialog.Description className="text-sm text-muted">
                  {description}
                </AlertDialog.Description>
              ) : (
                <AlertDialog.Description className="sr-only">{title}</AlertDialog.Description>
              )}
            </div>
          </div>
          {children}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className={buttonClass('secondary', 'md')}>
              Cancel
            </AlertDialog.Cancel>
            <button
              type="button"
              className={buttonClass('danger', 'md')}
              disabled={busy}
              aria-busy={busy || undefined}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
