import { useState } from 'react';
import { useCan } from '@/shared/session/store';
import { secondaryButton } from '@/shared/ui';
import type { Bill } from '../types';
import { VoidSheet } from './VoidSheet';

/** Void an unpaid or paid bill. Payment lives in `BillSettle`. */
export function BillActions({ bill }: { bill: Bill }) {
  const canVoid = useCan('bill.void');
  const canBill = useCan('bill.print');
  const [voiding, setVoiding] = useState(false);
  if (bill.status === 'VOID' || !(canVoid || canBill)) return null;
  return (
    <>
      <button
        type="button"
        className={`${secondaryButton} min-h-11`}
        onClick={() => setVoiding(true)}
      >
        {canVoid ? 'Void' : 'Void (manager)'}
      </button>
      {voiding && <VoidSheet bill={bill} onDone={() => setVoiding(false)} />}
    </>
  );
}
