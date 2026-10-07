import { useState } from 'react';
import { useCan } from '@/shared/session/store';
import { primaryButton, secondaryButton } from '@/shared/ui';
import { useRefreshOrder } from '@/features/orders';
import type { Bill } from '../types';
import { PaymentSheet } from './PaymentSheet';
import { VoidSheet } from './VoidSheet';

/** Take payment on an unpaid bill; void an unpaid or paid one. */
export function BillActions({ bill, onPaid }: { bill: Bill; onPaid: (bill: Bill) => void }) {
  const canPay = useCan('payment.take');
  const canVoid = useCan('bill.void');
  const canBill = useCan('bill.print');
  const refresh = useRefreshOrder();
  const [sheet, setSheet] = useState<'pay' | 'void' | null>(null);
  if (bill.status === 'VOID') return null;
  return (
    <>
      {bill.status === 'OPEN' && canPay && (
        <button
          type="button"
          className={`${primaryButton} min-h-11`}
          onClick={() => setSheet('pay')}
        >
          Take payment
        </button>
      )}
      {(canVoid || canBill) && (
        <button
          type="button"
          className={`${secondaryButton} min-h-11`}
          onClick={() => setSheet('void')}
        >
          {canVoid ? 'Void' : 'Void (manager)'}
        </button>
      )}
      {sheet === 'pay' && (
        <PaymentSheet
          bill={bill}
          onClose={() => setSheet(null)}
          onPaid={(updated) => {
            if (updated.status === 'PAID') setSheet(null);
            void refresh(bill.orderId);
            onPaid(updated);
          }}
        />
      )}
      {sheet === 'void' && <VoidSheet bill={bill} onDone={() => setSheet(null)} />}
    </>
  );
}
