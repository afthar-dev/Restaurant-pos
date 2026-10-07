import { useState } from 'react';
import { rupees } from '@/shared/lib/money';
import { describeError, ErrorNote, primaryButton } from '@/shared/ui';
import { useSendKot } from '../mutations';
import { useOrder } from '../queries';
import { orderLabel } from '../types';
import { CancelOrder } from './order-panel/CancelOrder';
import { KotCard } from './order-panel/KotCard';
import { NewLineRow } from './order-panel/NewLineRow';
import { QrRequestCard } from './qr/QrRequestCard';
import { TableActions } from './TableActions';

/** One order: dishes not yet sent, dishes in the kitchen by KOT, and the send button. */
export function OrderPanel({ orderId, onClosed }: { orderId: string; onClosed?: () => void }) {
  const order = useOrder(orderId);
  const send = useSendKot(orderId);
  const [cancelling, setCancelling] = useState<string | null>(null);

  if (!order.data) {
    if (order.isError) return <ErrorNote message={describeError(order.error)} />;
    return <p className="text-slate-500">Loading order…</p>;
  }
  const o = order.data;

  if (o.status === 'CANCELLED') {
    return (
      <p className="text-slate-600">
        This order was cancelled{o.cancelReason ? `: ${o.cancelReason}` : '.'}
      </p>
    );
  }

  const newLines = o.items.filter((i) => i.status === 'NEW');
  const sentLines = o.items.filter((i) => i.status === 'SENT');
  const kots = o.kots.filter((k) => k.type === 'NEW');

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {[orderLabel(o), ...o.mergedTables.map((t) => t.name)].join(' + ')}
        </h2>
        <span className="text-sm text-slate-600">
          {o.guests ? `${o.guests} guests · ` : ''}
          {o.waiter?.name}
        </span>
      </header>
      {o.status === 'PENDING_APPROVAL' && (
        <p className="text-sm font-medium text-amber-900">QR order waiting for approval</p>
      )}
      {o.qrPending.map((request) => (
        <QrRequestCard key={request.id} order={o} request={request} />
      ))}
      {o.status !== 'PENDING_APPROVAL' && <TableActions order={o} />}

      {kots.map((kot) => {
        const lines = sentLines.filter((l) => l.kotId === kot.id);
        if (lines.length === 0) return null;
        return (
          <KotCard
            key={kot.id}
            order={o}
            kot={kot}
            lines={lines}
            cancelling={cancelling}
            onCancelling={setCancelling}
          />
        );
      })}

      {newLines.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-white px-3 py-1">
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Not sent yet
          </p>
          <ul className="divide-y divide-slate-100">
            {newLines.map((line) => (
              <NewLineRow key={line.id} order={o} line={line} />
            ))}
          </ul>
        </div>
      )}

      {o.items.length === 0 && <p className="text-sm text-slate-500">Add dishes from the menu.</p>}

      <div className="flex items-center justify-between border-t border-slate-200 pt-2">
        <span className="text-sm text-slate-600">Total so far (before tax)</span>
        <span className="text-lg font-semibold tabular-nums">{rupees(o.subtotal)}</span>
      </div>

      {o.status === 'OPEN' ? (
        <>
          <ErrorNote message={send.isError ? describeError(send.error) : null} />
          <button
            type="button"
            className={`${primaryButton} min-h-12 text-base`}
            disabled={newLines.length === 0 || send.isPending}
            onClick={send.send}
          >
            {send.isPending ? 'Sending…' : `Send to kitchen (${newLines.length})`}
          </button>
        </>
      ) : o.status === 'BILLED' || o.status === 'CLOSED' ? (
        <p role="status" className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {o.status === 'BILLED'
            ? 'Bill printed. Waiting for payment.'
            : 'Paid and closed. The table is free.'}
        </p>
      ) : null}

      {sentLines.length === 0 && o.status === 'OPEN' && (
        <CancelOrder order={o} onClosed={onClosed} />
      )}
    </section>
  );
}
