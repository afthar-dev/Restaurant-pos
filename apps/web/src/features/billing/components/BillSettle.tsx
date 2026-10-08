import { useState } from 'react';
import { useRefreshOrder } from '@/features/orders';
import { useCan } from '@/shared/session/store';
import type { Bill } from '../types';
import { PaymentSheet } from './PaymentSheet';
import { SettlePanel } from './SettlePanel';

/** Payment on an open bill: the quick settle panel, and the full sheet for splits and parts. */
export function BillSettle({
  bill,
  onPaid,
  justCreated,
}: {
  bill: Bill;
  onPaid: (updated: Bill) => void;
  justCreated: boolean;
}) {
  const canPay = useCan('payment.take');
  const refresh = useRefreshOrder();
  const [sheet, setSheet] = useState(false);
  if (bill.status !== 'OPEN' || !canPay) return null;

  const paid = (updated: Bill) => {
    if (updated.status === 'PAID') setSheet(false);
    void refresh(bill.orderId);
    onPaid(updated);
  };

  return (
    <>
      <SettlePanel
        bill={bill}
        onPaid={paid}
        onMore={() => setSheet(true)}
        autoFocus={justCreated}
      />
      {sheet && <PaymentSheet bill={bill} onPaid={paid} onClose={() => setSheet(false)} />}
    </>
  );
}
