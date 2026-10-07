import {
  parseQuantity,
  parseRupees,
  PAYMENT_MODES,
  purchaseSchema,
  type PaymentMode,
} from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import { rupees } from '@/shared/lib/money';
import {
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import { useCreatePurchase } from '../mutations';
import type { StockItem } from '../types';

const MODE_LABEL: Record<PaymentMode, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' };

interface Row {
  key: number;
  stockItemId: string;
  quantity: string;
  amount: string;
}

let nextKey = 0;
const emptyRow = (): Row => ({ key: nextKey++, stockItemId: '', quantity: '', amount: '' });

/** One vendor bill: the items, how much of each, what it cost, and how it was paid. */
export function PurchaseForm({ items, onDone }: { items: StockItem[]; onDone: () => void }) {
  const [vendor, setVendor] = useState('');
  const [billRef, setBillRef] = useState('');
  const [paidMode, setPaidMode] = useState<PaymentMode>('CASH');
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCreatePurchase(onDone);

  const edit = (apply: () => void) => {
    save.formChanged();
    apply();
  };
  const setRow = (key: number, patch: Partial<Row>) =>
    edit(() => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r))));
  const total = rows.reduce((sum, r) => sum + (parseRupees(r.amount) ?? 0), 0);
  const unitOf = (id: string) => items.find((i) => i.id === id)?.unit ?? '';

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const lines = [];
    for (const [index, row] of rows.entries()) {
      const qtyMilli = parseQuantity(row.quantity);
      const amount = parseRupees(row.amount);
      if (!row.stockItemId) return setProblem(`Line ${index + 1}: choose the item.`);
      if (qtyMilli === null) return setProblem(`Line ${index + 1}: enter a quantity like 1.5`);
      if (amount === null || amount <= 0) {
        return setProblem(`Line ${index + 1}: enter the amount in rupees, like 420`);
      }
      lines.push({ stockItemId: row.stockItemId, qtyMilli, amount });
    }
    const parsed = purchaseSchema.safeParse({
      vendorName: vendor.trim(),
      ...(billRef.trim() ? { billRef: billRef.trim() } : {}),
      paidMode,
      lines,
    });
    if (!parsed.success) return setProblem(parsed.error.issues[0]?.message ?? 'Check the form.');
    setProblem(null);
    save.mutate(parsed.data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="New purchase"
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="purchase-vendor" label="Vendor">
          <input
            id="purchase-vendor"
            className={inputClass}
            value={vendor}
            onChange={(e) => edit(() => setVendor(e.target.value))}
          />
        </Field>
        <Field id="purchase-ref" label="Bill no. (optional)">
          <input
            id="purchase-ref"
            className={inputClass}
            value={billRef}
            onChange={(e) => edit(() => setBillRef(e.target.value))}
          />
        </Field>
        <Field id="purchase-mode" label="Paid by">
          <select
            id="purchase-mode"
            className={inputClass}
            value={paidMode}
            onChange={(e) => edit(() => setPaidMode(e.target.value as PaymentMode))}
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {rows.map((row, index) => (
        <fieldset
          key={row.key}
          aria-label={`Line ${index + 1}`}
          className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        >
          <Field id={`line-${row.key}-item`} label="Item">
            <select
              id={`line-${row.key}-item`}
              className={inputClass}
              value={row.stockItemId}
              onChange={(e) => setRow(row.key, { stockItemId: e.target.value })}
            >
              <option value="">Choose…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id={`line-${row.key}-qty`}
            label={`Quantity${row.stockItemId ? ` (${unitOf(row.stockItemId)})` : ''}`}
          >
            <input
              id={`line-${row.key}-qty`}
              inputMode="decimal"
              className={inputClass}
              value={row.quantity}
              onChange={(e) => setRow(row.key, { quantity: e.target.value })}
            />
          </Field>
          <Field id={`line-${row.key}-amount`} label="Amount (₹)">
            <input
              id={`line-${row.key}-amount`}
              inputMode="decimal"
              className={inputClass}
              value={row.amount}
              onChange={(e) => setRow(row.key, { amount: e.target.value })}
            />
          </Field>
          <button
            type="button"
            className={`${secondaryButton} min-h-11`}
            aria-label={`Remove line ${index + 1}`}
            disabled={rows.length === 1}
            onClick={() => edit(() => setRows((all) => all.filter((r) => r.key !== row.key)))}
          >
            Remove
          </button>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className={secondaryButton}
          onClick={() => edit(() => setRows((all) => [...all, emptyRow()]))}
        >
          Add line
        </button>
        <span className="text-lg font-semibold tabular-nums">Total {rupees(total)}</span>
      </div>
      <ErrorNote message={problem ?? (save.isError ? describeError(save.error) : null)} />
      <div className="flex gap-2">
        <button type="submit" className={`${primaryButton} min-h-11`} disabled={save.isPending}>
          Save purchase
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
