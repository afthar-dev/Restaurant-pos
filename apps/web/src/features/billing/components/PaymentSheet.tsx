import {
  PAYMENT_REFERENCE,
  PAYMENT_REFERENCE_HINT,
  paiseToRupeesInput,
  parseRupees,
  splitEqually,
  type PaymentMode,
} from '@rpos/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  describeError,
  ErrorNote,
  Field,
  inputClass,
  PaymentIcon,
  primaryButton,
  secondaryButton,
  Sheet,
} from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
import { useAddPayment } from '../mutations';
import type { Bill } from '../types';

const MODES: { mode: PaymentMode; label: string }[] = [
  { mode: 'CASH', label: 'Cash' },
  { mode: 'UPI', label: 'UPI' },
  { mode: 'CARD', label: 'Card' },
];

/** Notes a customer is likely to hand over. */
const NOTES = [10000, 20000, 50000, 200000];

/** Records one payment (recorded, not processed). Split equally = several payments. */
export function PaymentSheet({
  bill,
  onPaid,
  onClose,
}: {
  bill: Bill;
  onPaid: (bill: Bill) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [amount, setAmount] = useState(paiseToRupeesInput(bill.due));
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [parts, setParts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const payment = useAddPayment(bill, onPaid);
  const [awaiting, setAwaiting] = useState<number | null>(null);
  const catchingUp = awaiting !== null && bill.payments.length < awaiting;

  // After a part payment the bill comes back with less due: start the next one from there.
  useEffect(() => {
    setAmount(paiseToRupeesInput(bill.due));
    setTendered('');
  }, [bill.due]);

  const amountPaise = parseRupees(amount.trim());
  const tenderedPaise = tendered.trim() === '' ? null : parseRupees(tendered.trim());
  const cash = mode === 'CASH';
  const short =
    cash && tenderedPaise !== null && amountPaise !== null && tenderedPaise < amountPaise
      ? amountPaise - tenderedPaise
      : 0;
  // Equal shares of the whole bill: each person pays one, whatever was paid before.
  const shares = parts >= 2 && bill.total >= parts ? splitEqually(bill.total, parts) : [];
  const notes = NOTES.filter((n) => amountPaise !== null && n >= amountPaise).slice(0, 2);

  function record(event: FormEvent) {
    event.preventDefault();
    if (payment.isSending() || catchingUp) return;
    if (amountPaise === null || amountPaise <= 0) return setError('Enter the amount received.');
    if (amountPaise > bill.due) return setError(`Only ${rupees(bill.due)} is due.`);
    if (cash && tendered.trim() !== '' && tenderedPaise === null) {
      return setError('Enter the cash received in rupees, like 500.');
    }
    if (short > 0) return;
    if (!cash && reference.trim() && !PAYMENT_REFERENCE.test(reference.trim())) {
      return setError(PAYMENT_REFERENCE_HINT);
    }
    setError(null);
    payment.pay(
      {
        mode,
        amount: amountPaise,
        ...(cash && tenderedPaise !== null ? { tendered: tenderedPaise } : {}),
        ...(!cash && reference.trim() ? { reference: reference.trim() } : {}),
      },
      {
        onSuccess: (updated) => {
          if (updated.status !== 'PAID') {
            // Show what is left at once; Record stays off until the refreshed bill arrives, so
            // a quick second tap cannot record the same share again.
            setAwaiting(updated.payments.length);
            setAmount(paiseToRupeesInput(updated.due));
            setTendered('');
          }
        },
        onError: (failure) => setError(describeError(failure)),
      },
    );
  }

  return (
    <Sheet label={`Payment for bill ${bill.billNo}`} onClose={onClose}>
      <h3 className="text-lg font-semibold">
        Bill {bill.billNo} · {rupees(bill.due)} due
      </h3>
      <form onSubmit={record} noValidate className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Payment mode">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              aria-pressed={mode === m.mode}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border text-base font-semibold ${
                mode === m.mode
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : 'border-border-strong bg-surface'
              }`}
              onClick={() => setMode(m.mode)}
            >
              <PaymentIcon mode={m.mode} size="md" />
              {m.label}
            </button>
          ))}
        </div>

        <Field id={`${id}-split`} label="Split between">
          <select
            id={`${id}-split`}
            className={inputClass}
            value={parts}
            onChange={(e) => setParts(Number(e.target.value))}
          >
            <option value={0}>No split</option>
            {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n} people
              </option>
            ))}
          </select>
        </Field>
        {shares.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Equal shares">
            {shares.map((share, index) => (
              <button
                key={index}
                type="button"
                className={`${secondaryButton} min-h-11`}
                onClick={() => setAmount(paiseToRupeesInput(share))}
              >
                {rupees(share)}
              </button>
            ))}
          </div>
        )}

        <Field id={`${id}-amount`} label="Amount (₹)">
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        {cash ? (
          <>
            <Field id={`${id}-tendered`} label="Cash received (₹)">
              <input
                id={`${id}-tendered`}
                inputMode="decimal"
                className={inputClass}
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${secondaryButton} min-h-11`}
                onClick={() => setTendered(amount)}
              >
                Exact
              </button>
              {notes.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${secondaryButton} min-h-11`}
                  onClick={() => setTendered(paiseToRupeesInput(n))}
                >
                  {rupees(n)}
                </button>
              ))}
            </div>
            {tenderedPaise !== null && amountPaise !== null && (
              <p
                className={`text-lg font-semibold ${short > 0 ? 'text-red-700' : 'text-green-800'}`}
              >
                {short > 0
                  ? `${rupees(short)} more needed`
                  : `Change ${rupees(tenderedPaise - amountPaise)}`}
              </p>
            )}
          </>
        ) : (
          <Field id={`${id}-reference`} label="Reference (optional)">
            <input
              id={`${id}-reference`}
              className={inputClass}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        )}

        <ErrorNote message={error} />
        <div className="flex gap-2">
          <button
            type="submit"
            className={`${primaryButton} min-h-12 flex-1 text-base`}
            disabled={payment.isPending || short > 0 || catchingUp}
          >
            Record payment
          </button>
          <button type="button" className={`${secondaryButton} min-h-12`} onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </Sheet>
  );
}
