import { rupees } from '@/shared/lib/money';
import { describeError } from '@/shared/ui';
import { useMarkServed, useReprintKot } from '../../mutations';
import type { KotPrintState, Order, OrderKot, OrderLine } from '../../types';
import { CancelLineDialog } from './CancelLineDialog';
import { lineDetail } from './lineDetail';

const PRINT_LABEL: Record<Exclude<KotPrintState, 'NONE'>, string> = {
  WAITING: 'Not printed yet',
  PRINTED: 'Printed',
  FAILED: 'Print failed',
};

/** Whether the paper ticket came out, with a reprint for a jammed or missing ticket. */
function KotPrint({ kot, orderId }: { kot: OrderKot; orderId: string }) {
  const reprint = useReprintKot(kot.id, orderId);
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
function ServedButton({ kot, orderId }: { kot: OrderKot; orderId: string }) {
  const served = useMarkServed(kot.id, orderId);
  return (
    <>
      <button
        type="button"
        aria-label={`Served KOT ${kot.kotNo}`}
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

/** One KOT already in the kitchen: its status, print state and dishes (each cancellable). */
export function KotCard({
  order,
  kot,
  lines,
  cancelling,
  onCancelling,
}: {
  order: Order;
  kot: OrderKot;
  lines: OrderLine[];
  /** The line whose cancel form is open (one at a time across the order). */
  cancelling: string | null;
  onCancelling: (lineId: string | null) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          KOT {kot.kotNo} · {kot.stationName} · {kot.status.toLowerCase()}
        </p>
        <span className="flex items-center gap-2">
          {kot.status === 'READY' && <ServedButton kot={kot} orderId={order.id} />}
          <KotPrint kot={kot} orderId={order.id} />
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
                  onClick={() => onCancelling(line.id)}
                >
                  Cancel
                </button>
              </span>
            </div>
            {cancelling === line.id && (
              <CancelLineDialog order={order} line={line} onDone={() => onCancelling(null)} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
