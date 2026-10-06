import { useState } from 'react';
import { useCan } from '../../auth/store';
import { primaryButton } from '../../components/ui';
import { useRefreshOrder } from '../mutations';
import type { Bill } from '../types';
import { PaymentSheet } from './PaymentSheet';

/** Payment (and, from Task 5, void) buttons for one bill. */
export function BillActions({ bill, onPaid }: { bill: Bill; onPaid: (bill: Bill) => void }) {
  const canPay = useCan('payment.take');
  const refresh = useRefreshOrder();
  const [paying, setPaying] = useState(false);
  if (bill.status !== 'OPEN') return null;
  return (
    <>
      {canPay && (
        <button
          type="button"
          className={`${primaryButton} min-h-11`}
          onClick={() => setPaying(true)}
        >
          Take payment
        </button>
      )}
      {paying && (
        <PaymentSheet
          bill={bill}
          onClose={() => setPaying(false)}
          onPaid={(updated) => {
            if (updated.status === 'PAID') setPaying(false);
            void refresh(bill.orderId);
            onPaid(updated);
          }}
        />
      )}
    </>
  );
}
