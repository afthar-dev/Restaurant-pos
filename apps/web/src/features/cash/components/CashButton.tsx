import { Banknote } from 'lucide-react';
import { useState } from 'react';
import { useCan } from '@/shared/session/store';
import { secondaryButton } from '@/shared/ui';
import { CashDialog } from './CashDialog';

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
      {open && <CashDialog onClose={() => setOpen(false)} />}
    </>
  );
}
