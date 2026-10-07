import { useId, useState } from 'react';
import { useCan } from '@/shared/session/store';
import {
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
import { useDecideQrRequest } from '../../mutations';
import type { Order, QrRequest } from '../../types';

const dish = (name: string, variant: string) =>
  variant === 'Regular' ? name : `${name} (${variant})`;

/** One request from the table QR: approve as sent, edit quantities, or reject (§5.3). */
export function QrRequestCard({ order, request }: { order: Order; request: QrRequest }) {
  const id = useId();
  const canApprove = useCan('order.approveQr');
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [quantities, setQuantities] = useState(() => request.lines.map((l) => l.quantity));
  const [reason, setReason] = useState('');
  const decision = useDecideQrRequest(order, request.id);
  const busy = decision.isPending;

  const edited = request.lines
    .map((l, index) => ({ line: l, quantity: quantities[index] ?? 0 }))
    .filter((e) => e.quantity > 0)
    .map(({ line, quantity }) => ({
      variantId: line.variantId,
      quantity,
      addonIds: line.addonIds,
      ...(line.note ? { note: line.note } : {}),
    }));

  return (
    <section
      aria-label={`QR order from ${request.tableName ?? 'the table'}`}
      className="flex flex-col gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
        From the table QR
      </p>
      <ul className="flex flex-col gap-1">
        {request.lines.map((l, index) => (
          <li key={`${l.variantId}-${index}`} className="flex items-center justify-between gap-2">
            <span>
              <span>
                {mode === 'edit'
                  ? dish(l.itemName, l.variantName)
                  : `${l.quantity} × ${dish(l.itemName, l.variantName)}`}
              </span>
              {l.addons.length > 0 && (
                <span className="block text-xs text-slate-600">{l.addons.join(', ')}</span>
              )}
              {l.note && <span className="block text-xs italic text-slate-600">“{l.note}”</span>}
            </span>
            {mode === 'edit' ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`One less ${l.itemName}`}
                  className={`${secondaryButton} h-11 w-11`}
                  onClick={() =>
                    setQuantities((q) => q.map((n, i) => (i === index ? Math.max(0, n - 1) : n)))
                  }
                >
                  −
                </button>
                <span className="w-6 text-center tabular-nums">{quantities[index]}</span>
                <button
                  type="button"
                  aria-label={`One more ${l.itemName}`}
                  className={`${secondaryButton} h-11 w-11`}
                  onClick={() =>
                    setQuantities((q) => q.map((n, i) => (i === index ? Math.min(99, n + 1) : n)))
                  }
                >
                  +
                </button>
              </span>
            ) : (
              <span className="text-sm tabular-nums">{rupees(l.amount)}</span>
            )}
          </li>
        ))}
      </ul>
      {request.note && <p className="text-sm italic text-amber-950">“{request.note}”</p>}
      <p className="text-sm text-slate-600">About {rupees(request.total)} before tax</p>
      <ErrorNote message={decision.isError ? describeError(decision.error) : null} />
      {canApprove && mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${primaryButton} min-h-11`}
            disabled={busy}
            onClick={() => decision.decide({ action: 'approve', body: {} })}
          >
            Approve
          </button>
          <button
            type="button"
            className={`${secondaryButton} min-h-11`}
            disabled={busy}
            onClick={() => setMode('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            className={`${secondaryButton} min-h-11`}
            disabled={busy}
            onClick={() => setMode('reject')}
          >
            Reject
          </button>
        </div>
      )}
      {canApprove && mode === 'edit' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${primaryButton} min-h-11`}
            disabled={busy || edited.length === 0}
            onClick={() => decision.decide({ action: 'approve', body: { lines: edited } })}
          >
            Approve changes
          </button>
          <button
            type="button"
            className={`${secondaryButton} min-h-11`}
            onClick={() => {
              setQuantities(request.lines.map((l) => l.quantity));
              setMode('view');
            }}
          >
            Back
          </button>
        </div>
      )}
      {canApprove && mode === 'reject' && (
        <div className="flex flex-col gap-2">
          <Field id={`${id}-reason`} label="Reason (optional)">
            <input
              id={`${id}-reason`}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="button"
              className={`${dangerButton} min-h-11`}
              disabled={busy}
              onClick={() =>
                decision.decide({
                  action: 'reject',
                  body: reason.trim() ? { reason: reason.trim() } : {},
                })
              }
            >
              Yes, reject
            </button>
            <button
              type="button"
              className={`${secondaryButton} min-h-11`}
              onClick={() => setMode('view')}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
