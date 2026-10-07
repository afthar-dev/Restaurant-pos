import { useEffect, useRef, useState } from 'react';
import { type Bill, BillActions, BillArea } from '@/features/billing';
import { MenuBrowser, orderLabel, OrderPanel, useOrder } from '@/features/orders';

/** How long "Bill paid" stays before the counter goes back to the floor. */
const PAID_NOTE_MS = 1500;

/** The selected order with the menu to add dishes. `layout` decides side-by-side or stacked. */
export function OrderWorkspace({
  orderId,
  layout,
  onClosed,
}: {
  orderId: string;
  layout: 'columns' | 'stack';
  onClosed: () => void;
}) {
  const order = useOrder(orderId);
  const [paid, setPaid] = useState<Bill | null>(null);
  const status = order.data?.status;
  const editable = status === 'OPEN';
  const billable = order.data && status !== 'CANCELLED';
  const settled = paid !== null && status === 'CLOSED';
  // Parents pass a new function on every render; the timer must not restart because of it.
  const close = useRef(onClosed);
  close.current = onClosed;

  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => close.current(), PAID_NOTE_MS);
    return () => clearTimeout(timer);
  }, [settled]);

  return (
    <div
      className={
        layout === 'columns'
          ? 'grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]'
          : 'flex flex-col gap-4'
      }
    >
      <div className="flex flex-col gap-4">
        {settled && order.data && (
          <p
            role="status"
            className="rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white"
          >
            {`Bill ${paid.billNo} paid. ${orderLabel(order.data)} is free.`}
          </p>
        )}
        <OrderPanel orderId={orderId} onClosed={onClosed} />
        {billable && (
          <BillArea
            order={order.data!}
            billActions={(bill) => <BillActions bill={bill} onPaid={setPaid} />}
          />
        )}
      </div>
      {order.data && editable && <MenuBrowser orderId={orderId} orderType={order.data.type} />}
    </div>
  );
}
