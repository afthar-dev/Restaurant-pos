import { formatQuantity } from '@rpos/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { rupees } from '@/shared/lib/money';
import {
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  LoadingScreen,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import { PurchaseForm } from '../components/PurchaseForm';
import { useVoidPurchase } from '../mutations';
import { usePurchases, useStockItems } from '../queries';
import type { Purchase } from '../types';

function VoidPurchase({ purchase, onDone }: { purchase: Purchase; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const voiding = useVoidPurchase(onDone);
  const id = `void-${purchase.id}`;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-900">The stock comes back out and the expense is voided.</p>
      <Field id={id} label="Why void this purchase?">
        <input
          id={id}
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <ErrorNote message={voiding.isError ? describeError(voiding.error) : null} />
      <div className="flex gap-2">
        <button
          type="button"
          className={dangerButton}
          disabled={reason.trim().length < 3 || voiding.isPending}
          onClick={() => voiding.mutate({ id: purchase.id, reason: reason.trim() })}
        >
          Void purchase
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Keep it
        </button>
      </div>
    </div>
  );
}

/** Today's purchases from vendors; each adds stock and books a Raw material expense. */
export function PurchasesPage() {
  const purchases = usePurchases();
  const items = useStockItems();
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Purchases today</h1>
        <div className="flex gap-2">
          <Link to="/stock" className={`${secondaryButton} min-h-11 content-center`}>
            Stock
          </Link>
          {!adding && (
            <button type="button" className={primaryButton} onClick={() => setAdding(true)}>
              New purchase
            </button>
          )}
        </div>
      </div>
      {adding &&
        (items.data && items.data.length > 0 ? (
          <PurchaseForm items={items.data} onDone={() => setAdding(false)} />
        ) : items.data ? (
          <p className="text-slate-600">
            Add stock items first on the{' '}
            <Link to="/stock" className="underline">
              Stock
            </Link>{' '}
            page.
          </p>
        ) : (
          <LoadingScreen />
        ))}
      <ErrorNote message={purchases.isError ? describeError(purchases.error) : null} />
      {purchases.data?.length === 0 && <p className="text-slate-500">No purchases today.</p>}
      <ul className="flex flex-col gap-2">
        {purchases.data?.map((p) => {
          const voided = p.voidedAt !== null;
          return (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`font-semibold ${voided ? 'text-slate-400 line-through' : ''}`}>
                  {p.vendorName}
                  {p.billRef ? ` #${p.billRef}` : ''}
                </span>
                <span className={`tabular-nums ${voided ? 'text-slate-400 line-through' : ''}`}>
                  {`${rupees(p.total)} · ${p.paidMode}`}
                </span>
              </div>
              <ul className="text-sm text-slate-600">
                {p.lines.map((l) => (
                  <li
                    key={l.id}
                  >{`${l.itemName} · ${formatQuantity(l.qtyMilli)} ${l.unit} · ${rupees(l.amount)}`}</li>
                ))}
              </ul>
              {voided ? (
                <p className="text-xs text-slate-500">Voided: {p.voidReason}</p>
              ) : (
                voiding !== p.id && (
                  <button
                    type="button"
                    className="self-start text-xs text-red-700 underline"
                    aria-label={`Void purchase from ${p.vendorName}`}
                    onClick={() => setVoiding(p.id)}
                  >
                    Void
                  </button>
                )
              )}
              {voiding === p.id && <VoidPurchase purchase={p} onDone={() => setVoiding(null)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
