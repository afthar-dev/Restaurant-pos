import { useState } from 'react';
import { rupees } from '@/shared/lib/money';
import {
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  secondaryButton,
} from '@/shared/ui';
import { useVoidExpense } from '../mutations';
import { MODE_LABEL, type Expense, type ExpenseTotals } from '../types';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function VoidForm({ expense, onDone }: { expense: Expense; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const voiding = useVoidExpense(onDone);
  const id = `void-${expense.id}`;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-3">
      <Field id={id} label="Why void this expense?">
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
          onClick={() => voiding.mutate({ id: expense.id, reason: reason.trim() })}
        >
          Void expense
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Keep it
        </button>
      </div>
    </div>
  );
}

/** The day's expenses with totals; voided ones stay listed, struck through. */
export function ExpenseList({
  expenses,
  totals,
  canVoid,
}: {
  expenses: Expense[];
  totals: ExpenseTotals;
  canVoid: boolean;
}) {
  const [voiding, setVoiding] = useState<string | null>(null);
  return (
    <section aria-label="Today's expenses" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 rounded-lg bg-slate-100 px-4 py-3 text-sm">
        <span>
          Total <strong className="tabular-nums">{rupees(totals.total)}</strong>
        </span>
        <span>
          Cash from the drawer <strong className="tabular-nums">{rupees(totals.cash)}</strong>
        </span>
      </div>
      {expenses.length === 0 && <p className="text-sm text-slate-500">No expenses yet today.</p>}
      <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {expenses.map((e) => {
          const voided = e.voidedAt !== null;
          return (
            <li key={e.id} className="flex flex-col gap-2 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`flex flex-col ${voided ? 'text-slate-400 line-through' : ''}`}>
                  <span className="font-medium">
                    {e.category.name}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                  <span className="text-xs text-slate-500">
                    {`${time(e.createdAt)} · ${MODE_LABEL[e.mode]} · ${e.createdBy.name}`}
                  </span>
                </div>
                <span className="flex items-center gap-3">
                  <span className={`tabular-nums ${voided ? 'text-slate-400 line-through' : ''}`}>
                    {rupees(e.amount)}
                  </span>
                  {canVoid && !voided && e.source === 'MANUAL' && (
                    <button
                      type="button"
                      aria-label={`Void ${e.category.name} ${rupees(e.amount)}`}
                      className="text-xs text-red-700 underline"
                      onClick={() => setVoiding(e.id)}
                    >
                      Void
                    </button>
                  )}
                </span>
              </div>
              {voided && <p className="text-xs text-slate-500">Voided: {e.voidReason}</p>}
              {e.source === 'PURCHASE' && !voided && (
                <p className="text-xs text-slate-500">From a purchase (void it on Purchases)</p>
              )}
              {voiding === e.id && <VoidForm expense={e} onDone={() => setVoiding(null)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
