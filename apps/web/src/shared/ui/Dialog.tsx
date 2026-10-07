import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { useReturnFocus } from './useReturnFocus';

/**
 * A modal panel: a bottom sheet on phones and a centred card on larger screens, so it is in
 * reach wherever the page was scrolled. Focus moves into it and back to the opener when it
 * closes; Escape and the close button call `onClose`. A tap outside does not (a stray tap must
 * not throw away a half-typed payment) unless `dismissOnOutside` is set.
 *
 * Render it only while it should be open (`{editing && <Dialog …/>}`), the same contract as
 * the older `Sheet`.
 */
export function Dialog({
  label,
  onClose,
  children,
  wide = false,
  dismissOnOutside = false,
}: {
  /** The dialog's accessible name, usually the same as its visible heading. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dismissOnOutside?: boolean;
}) {
  useReturnFocus();
  return (
    <RadixDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-slate-950/45 backdrop-blur-[1px]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => !dismissOnOutside && event.preventDefault()}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] animate-slide-up flex-col gap-4',
            'overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-overlay outline-none',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          )}
        >
          <RadixDialog.Title className="sr-only">{label}</RadixDialog.Title>
          <RadixDialog.Close
            aria-label="Close"
            className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"
          >
            <X aria-hidden="true" className="size-5" />
          </RadixDialog.Close>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
