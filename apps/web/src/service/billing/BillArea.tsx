import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '../../auth/api';
import { useCan } from '../../auth/store';
import { describeError, ErrorNote, primaryButton, secondaryButton } from '../../components/ui';
import { rupees } from '../../pages/admin/menu-types';
import { useRefreshOrder } from '../mutations';
import { useOrderBills } from '../queries';
import type { Bill, Order } from '../types';
import { BillView, STATUS_LABEL } from './BillView';
import { printBill } from './printBill';
import { SplitSheet } from './SplitSheet';

/**
 * Billing for one order: the Bill / Split bill buttons while dishes are unbilled, then its
 * bills (the unpaid one open). `billActions` adds per-bill buttons (payment, void).
 */
export function BillArea({
  order,
  billActions,
}: {
  order: Order;
  billActions?: (bill: Bill) => ReactNode;
}) {
  const canBill = useCan('bill.print');
  const bills = useOrderBills(order.id);
  const refresh = useRefreshOrder();
  const [splitting, setSplitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // A parcel's unsent dishes go to the kitchen first; the id survives a retry (no double KOT).
  const sendKey = useRef<string | null>(null);

  const newLines = order.items.filter((i) => i.status === 'NEW');
  const sentLines = order.items.filter((i) => i.status === 'SENT');
  const unbilled = sentLines.some((i) => i.quantity > i.billedQuantity);
  const parcel = order.type === 'PARCEL';

  const create = useMutation({
    mutationFn: async (lines?: { orderItemId: string; quantity: number }[]) => {
      let sentNow = false;
      if (newLines.length > 0) {
        sendKey.current ??= crypto.randomUUID();
        await apiFetch(`/api/orders/${order.id}/kot`, {
          method: 'POST',
          headers: { 'Idempotency-Key': sendKey.current },
        });
        sendKey.current = null;
        sentNow = true;
      }
      return apiFetch<Bill>(`/api/orders/${order.id}/bills`, {
        method: 'POST',
        // After sending, the order version moved on; the server still checks dish quantities.
        headers: sentNow ? {} : { 'If-Match': String(order.version) },
        body: lines ? { lines } : {},
      });
    },
    onSuccess: async (bill) => {
      setSplitting(false);
      setExpanded(bill.id);
      try {
        const where = await printBill(bill.id);
        setNote(where === 'queued' ? 'Sent to the bill printer.' : null);
      } catch (error) {
        setNote(`Bill ${bill.billNo} is saved but did not print: ${describeError(error)}`);
      }
    },
    onSettled: () => refresh(order.id),
  });

  if (!canBill) return null;
  const list = [...(bills.data ?? [])].reverse();
  const openBill = list.find((b) => b.status === 'OPEN');
  const shown = expanded ?? openBill?.id ?? null;
  const canCreate = order.status === 'OPEN' && (unbilled || newLines.length > 0);
  const blocked = newLines.length > 0 && !parcel;

  return (
    <section aria-label="Billing" className="flex flex-col gap-3">
      {canCreate && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${primaryButton} min-h-12 flex-1 text-base`}
              disabled={blocked || create.isPending}
              onClick={() => create.mutate(undefined)}
            >
              {newLines.length > 0 && parcel ? 'Send & bill' : 'Bill'}
            </button>
            {!blocked && newLines.length === 0 && (
              <button
                type="button"
                className={`${secondaryButton} min-h-12`}
                onClick={() => setSplitting(true)}
              >
                Split bill
              </button>
            )}
          </div>
          {blocked && (
            <p className="text-sm text-slate-600">Send the new dishes to the kitchen first.</p>
          )}
        </div>
      )}
      <ErrorNote message={create.isError ? describeError(create.error) : null} />
      {note && (
        <p role="status" className="text-sm text-slate-600">
          {note}
        </p>
      )}
      {list.map((bill) =>
        bill.id === shown ? (
          <BillView key={bill.id} bill={bill} actions={billActions?.(bill)} />
        ) : (
          <button
            key={bill.id}
            type="button"
            className="flex min-h-11 justify-between rounded-lg border border-slate-200 bg-white px-3 text-left text-sm"
            onClick={() => setExpanded(bill.id)}
          >
            {`Bill ${bill.billNo} · ${rupees(bill.total)} · ${STATUS_LABEL[bill.status]}`}
          </button>
        ),
      )}
      {splitting && (
        <SplitSheet
          lines={sentLines}
          busy={create.isPending}
          onBill={(lines) => create.mutate(lines)}
          onClose={() => setSplitting(false)}
        />
      )}
    </section>
  );
}
