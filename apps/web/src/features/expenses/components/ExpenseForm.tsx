import { expenseSchema, parseRupees, PAYMENT_MODES, type PaymentMode } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import {
  describeError,
  ErrorNote,
  Field,
  fieldErrors,
  inputClass,
  primaryButton,
  type FieldErrors,
} from '@/shared/ui';
import { useAddExpense } from '../mutations';
import { useExpenseCategories } from '../queries';
import { MODE_LABEL } from '../types';

/** Category, amount, how it was paid and a note: one expense on today's business day. */
export function ExpenseForm() {
  const categories = useExpenseCategories();
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState<string | null>(null);
  const add = useAddExpense(() => {
    setSaved('Expense saved.');
    setAmount('');
    setNote('');
  });

  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      add.formChanged();
      setSaved(null);
      set(value);
    };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const paise = parseRupees(amount);
    if (paise === null || paise <= 0) {
      setErrors({ amount: 'Enter the amount in rupees, like 450' });
      return;
    }
    const parsed = expenseSchema.safeParse({
      categoryId,
      amount: paise,
      mode,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    add.mutate(parsed.data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="New expense"
      className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
    >
      <Field id="expense-category" label="Category" error={errors.categoryId}>
        <select
          id="expense-category"
          className={inputClass}
          value={categoryId}
          onChange={(e) => change(setCategoryId)(e.target.value)}
        >
          <option value="">Choose…</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="expense-amount" label="Amount (₹)" error={errors.amount}>
        <input
          id="expense-amount"
          inputMode="decimal"
          className={inputClass}
          value={amount}
          onChange={(e) => change(setAmount)(e.target.value)}
        />
      </Field>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Paid by</legend>
        <div className="flex gap-2">
          {PAYMENT_MODES.map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="expense-mode"
                checked={mode === m}
                onChange={() => change(setMode)(m)}
              />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="expense-note" label="Note (optional)" error={errors.note}>
        <input
          id="expense-note"
          className={inputClass}
          maxLength={140}
          value={note}
          onChange={(e) => change(setNote)(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className={`${primaryButton} min-h-11`} disabled={add.isPending}>
          Save expense
        </button>
        {saved && (
          <p role="status" className="text-sm text-emerald-800">
            {saved}
          </p>
        )}
      </div>
      <div className="sm:col-span-2">
        <ErrorNote message={add.isError ? describeError(add.error) : null} />
      </div>
    </form>
  );
}
