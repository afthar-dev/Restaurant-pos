import { BellRing, ChefHat } from 'lucide-react';
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
    return <p className="text-subtle">Loading order…</p>;
  }
  const o = order.data;

  if (o.status === 'CANCELLED') {
    return (
      <p className="text-muted">
        This order was cancelled{o.cancelReason ? `: ${o.cancelReason}` : '.'}
      </p>
    );
  }

  const newLines = o.items.filter((i) => i.status === 'NEW');
  const sentLines = o.items.filter((i) => i.status === 'SENT');
  const kots = o.kots.filter((k) => k.type === 'NEW');

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          {[orderLabel(o), ...o.mergedTables.map((t) => t.name)].join(' + ')}
        </h2>
        <span className="text-sm text-muted">
          {o.guests ? `${o.guests} guests · ` : ''}
          {o.waiter?.name}
        </span>
      </header>
      {o.status === 'PENDING_APPROVAL' && (
        <p className="flex items-center gap-2 rounded-md bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900">
          <BellRing aria-hidden="true" className="size-4" />
          QR order waiting for approval
        </p>
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
        <div className="rounded-lg border border-primary-200 bg-surface px-3 py-1">
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-primary-800">
            Not sent yet
          </p>
          <ul className="divide-y divide-border">
            {newLines.map((line) => (
              <NewLineRow key={line.id} order={o} line={line} />
            ))}
          </ul>
        </div>
      )}

      {o.items.length === 0 && <p className="text-sm text-subtle">Add dishes from the menu.</p>}

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm text-muted">Total so far (before tax)</span>
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
            <ChefHat aria-hidden="true" />
            {send.isPending ? 'Sending…' : `Send to kitchen (${newLines.length})`}
          </button>
        </>
      ) : o.status === 'BILLED' || o.status === 'CLOSED' ? (
        <p role="status" className="rounded-md bg-surface-2 px-3 py-2 text-sm text-text">
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
