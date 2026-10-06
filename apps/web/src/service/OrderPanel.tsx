import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { apiFetch } from '../auth/api';
import { useCan } from '../auth/store';
import {
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '../components/ui';
import { ApproverFields, isPin, requestOverride } from '../components/ManagerApproval';
import { rupees } from '../pages/admin/menu-types';
import { useRefreshOrder } from './mutations';
import { useOrder } from './queries';
import { QrRequestCard } from './qr/QrRequestCard';
import { TableActions } from './TableActions';
import { orderLabel, type KotPrintState, type Order, type OrderKot, type OrderLine } from './types';

function lineDetail(line: OrderLine): string {
  const parts = [
    line.variantName !== 'Regular' ? line.variantName : '',
    ...line.addons.map((a) => a.name),
  ];
  return parts.filter(Boolean).join(', ');
}

function CancelLineDialog({
  order,
  line,
  onDone,
}: {
  order: Order;
  line: OrderLine;
  onDone: () => void;
}) {
  const refresh = useRefreshOrder();
  const canCancel = useCan('item.cancelAfterKot');
  const [reason, setReason] = useState('');
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: async () => {
      const headers: Record<string, string> = {};
      if (!canCancel) {
        headers['x-override-token'] = await requestOverride(approverId, pin, 'item.cancelAfterKot');
      }
      return apiFetch(`/api/orders/${order.id}/items/${line.id}/cancel`, {
        method: 'POST',
        headers,
        body: { reason: reason.trim(), quantity: Number(quantity) },
      });
    },
    onSuccess: async () => {
      await refresh(order.id);
      onDone();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) return setError('Give a short reason.');
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > line.quantity) {
      return setError(`Cancel between 1 and ${line.quantity}.`);
    }
    if (!canCancel && (!approverId || !isPin(pin))) {
      return setError('A manager must pick their name and enter their PIN.');
    }
    setError(null);
    cancel.mutate();
  }

  return (
    <form
      role="dialog"
      aria-label={`Cancel ${line.itemName}`}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3"
    >
      <p className="text-sm text-red-900">
        This dish is already in the kitchen. A cancellation ticket goes to {''}
        the same station.
      </p>
      <Field id={`cancel-reason-${line.id}`} label="Reason">
        <input
          id={`cancel-reason-${line.id}`}
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {line.quantity > 1 && (
        <Field id={`cancel-qty-${line.id}`} label="How many">
          <input
            id={`cancel-qty-${line.id}`}
            type="number"
            min={1}
            max={line.quantity}
            className={`${inputClass} w-24`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
      )}
      {!canCancel && (
        <ApproverFields
          idPrefix={`cancel-${line.id}`}
          approverId={approverId}
          pin={pin}
          onApprover={setApproverId}
          onPin={setPin}
        />
      )}
      <ErrorNote message={error ?? (cancel.isError ? describeError(cancel.error) : null)} />
      <div className="flex gap-2">
        <button type="submit" className={dangerButton} disabled={cancel.isPending}>
          Cancel dish
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Keep it
        </button>
      </div>
    </form>
  );
}

function NewLineRow({ order, line }: { order: Order; line: OrderLine }) {
  const refresh = useRefreshOrder();
  // Quantities are absolute, so send the version we saw: if another screen changed the order
  // meanwhile the server answers 409 and we refresh instead of overwriting its change.
  const change = useMutation({
    mutationFn: (quantity: number) => {
      const headers = { 'If-Match': String(order.version) };
      return quantity === 0
        ? apiFetch(`/api/orders/${order.id}/items/${line.id}`, { method: 'DELETE', headers })
        : apiFetch(`/api/orders/${order.id}/items/${line.id}`, {
            method: 'PATCH',
            headers,
            body: { quantity },
          });
    },
    onSettled: () => refresh(order.id),
  });
  const detail = lineDetail(line);
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{line.itemName}</span>
          {detail && <span className="text-xs text-slate-500">{detail}</span>}
          {line.note && <span className="text-xs italic text-slate-500">“{line.note}”</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`One less ${line.itemName}`}
            className={`${secondaryButton} h-9 w-9`}
            disabled={change.isPending}
            onClick={() => change.mutate(line.quantity - 1)}
          >
            −
          </button>
          <span className="w-6 text-center tabular-nums">{line.quantity}</span>
          <button
            type="button"
            aria-label={`One more ${line.itemName}`}
            className={`${secondaryButton} h-9 w-9`}
            disabled={change.isPending || line.quantity >= 99}
            onClick={() => change.mutate(line.quantity + 1)}
          >
            +
          </button>
          <span className="w-16 text-right text-sm tabular-nums">{rupees(line.lineTotal)}</span>
        </div>
      </div>
      <ErrorNote message={change.isError ? describeError(change.error) : null} />
    </li>
  );
}

const PRINT_LABEL: Record<Exclude<KotPrintState, 'NONE'>, string> = {
  WAITING: 'Not printed yet',
  PRINTED: 'Printed',
  FAILED: 'Print failed',
};

/** Whether the paper ticket came out, with a reprint for a jammed or missing ticket. */
function KotPrint({ kot, orderId }: { kot: OrderKot; orderId: string }) {
  const refresh = useRefreshOrder();
  const reprint = useMutation({
    mutationFn: () => apiFetch(`/api/kots/${kot.id}/reprint`, { method: 'POST' }),
    onSettled: () => refresh(orderId),
  });
  if (kot.print === 'NONE') return null;
  return (
    <span className="flex items-center gap-2 text-xs">
      <span
        className={
          kot.print === 'FAILED'
            ? 'font-semibold text-red-700'
            : kot.print === 'WAITING'
              ? 'text-amber-800'
              : 'text-slate-500'
        }
      >
        {PRINT_LABEL[kot.print]}
      </span>
      <button
        type="button"
        aria-label={`Reprint KOT ${kot.kotNo}`}
        className="text-slate-700 underline disabled:opacity-50"
        disabled={reprint.isPending}
        onClick={() => reprint.mutate()}
      >
        {reprint.isPending ? 'Reprinting…' : 'Reprint'}
      </button>
      {reprint.isError && <span className="text-red-700">{describeError(reprint.error)}</span>}
    </span>
  );
}

/** The waiter has taken the ready dishes to the table (spec §5.1 step 5). */
function ServedButton({
  kotId,
  kotNo,
  orderId,
}: {
  kotId: string;
  kotNo: number;
  orderId: string;
}) {
  const refresh = useRefreshOrder();
  const served = useMutation({
    mutationFn: () => apiFetch(`/api/kots/${kotId}/served`, { method: 'POST' }),
    onSettled: () => refresh(orderId),
  });
  return (
    <>
      <button
        type="button"
        aria-label={`Served KOT ${kotNo}`}
        className="min-h-9 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-60"
        disabled={served.isPending}
        onClick={() => served.mutate()}
      >
        Served
      </button>
      {served.isError && (
        <span className="text-xs text-red-700">{describeError(served.error)}</span>
      )}
    </>
  );
}

function CancelOrder({ order, onClosed }: { order: Order; onClosed?: () => void }) {
  const refresh = useRefreshOrder();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () =>
      apiFetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: async () => {
      await refresh(order.id);
      onClosed?.();
    },
  });
  if (!open) {
    return (
      <button
        type="button"
        className={`${secondaryButton} self-start`}
        onClick={() => setOpen(true)}
      >
        Cancel order
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <Field id={`cancel-order-${order.id}`} label="Why cancel this order?">
        <input
          id={`cancel-order-${order.id}`}
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <ErrorNote message={cancel.isError ? describeError(cancel.error) : null} />
      <div className="flex gap-2">
        <button
          type="button"
          className={dangerButton}
          disabled={reason.trim().length < 3 || cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          Yes, cancel order
        </button>
        <button type="button" className={secondaryButton} onClick={() => setOpen(false)}>
          Keep order
        </button>
      </div>
    </div>
  );
}

/** One order: dishes not yet sent, dishes in the kitchen by KOT, and the send button. */
export function OrderPanel({ orderId, onClosed }: { orderId: string; onClosed?: () => void }) {
  const order = useOrder(orderId);
  const refresh = useRefreshOrder();
  const [cancelling, setCancelling] = useState<string | null>(null);
  // One id per send. Kept after a failure so a retry cannot create a second KOT.
  const sendKey = useRef<string | null>(null);
  // Two taps faster than a re-render must still send only once.
  const sending = useRef(false);

  const send = useMutation({
    mutationFn: () => {
      sendKey.current ??= crypto.randomUUID();
      return apiFetch(`/api/orders/${orderId}/kot`, {
        method: 'POST',
        headers: { 'Idempotency-Key': sendKey.current },
      });
    },
    onSuccess: () => {
      sendKey.current = null;
    },
    // Refresh on failure too: "nothing to send" usually means another screen already sent it.
    onSettled: async () => {
      sending.current = false;
      await refresh(orderId);
    },
  });

  function sendToKitchen() {
    if (sending.current) return;
    sending.current = true;
    send.mutate();
  }

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
          <div key={kot.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                KOT {kot.kotNo} · {kot.stationName} · {kot.status.toLowerCase()}
              </p>
              <span className="flex items-center gap-2">
                {kot.status === 'READY' && (
                  <ServedButton kotId={kot.id} kotNo={kot.kotNo} orderId={o.id} />
                )}
                <KotPrint kot={kot} orderId={o.id} />
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {lines.map((line) => (
                <li key={line.id} className="flex flex-col gap-2 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {line.quantity} × {line.itemName}
                      {lineDetail(line) && (
                        <span className="text-xs text-slate-500"> · {lineDetail(line)}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm tabular-nums">{rupees(line.lineTotal)}</span>
                      <button
                        type="button"
                        aria-label={`Cancel ${line.itemName}`}
                        className="text-xs text-red-700 underline"
                        onClick={() => setCancelling(line.id)}
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                  {cancelling === line.id && (
                    <CancelLineDialog order={o} line={line} onDone={() => setCancelling(null)} />
                  )}
                </li>
              ))}
            </ul>
          </div>
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
            onClick={sendToKitchen}
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
