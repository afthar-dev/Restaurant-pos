import { parseRupees, type PaymentMode } from '@rpos/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { rupees } from '@/shared/lib/money';
import { Button, describeError, ErrorNote, Field, MoneyInput, PaymentIcon } from '@/shared/ui';
import { useAddPayment } from '../mutations';
import { cashOutcome, suggestNotes } from '../settle';
import type { Bill } from '../types';
import { useSettleKeys, type SettleKey } from './useSettleKeys';

const MODES: { mode: PaymentMode; label: string; key: SettleKey }[] = [
  { mode: 'CASH', label: 'Cash', key: 'c' },
  { mode: 'UPI', label: 'UPI', key: 'u' },
  { mode: 'CARD', label: 'Card', key: 'k' },
];

type Tender = { kind: 'exact' } | { kind: 'note'; amount: number } | { kind: 'other' };

/**
 * Settles a whole open bill in two taps: choose Cash, UPI or Card, then one confirm that names
 * the amount and mode. Cash shows suggested notes and the change. Splits and part payments go
 * to the full sheet through `onMore`.
 */
export function SettlePanel({
  bill,
  onPaid,
  onMore,
  autoFocus = false,
}: {
  bill: Bill;
  onPaid: (updated: Bill) => void;
  onMore: () => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const payment = useAddPayment(bill, onPaid);
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [tender, setTender] = useState<Tender>({ kind: 'exact' });
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const modeButtons = useRef(new Map<PaymentMode, HTMLButtonElement>());
  const confirmButton = useRef<HTMLButtonElement>(null);
  const lastMode = useRef<PaymentMode | null>(null);
  const panel = useRef<HTMLElement>(null);

  // Another device or a discount changed what is due: start again so nobody confirms an old amount.
  useEffect(() => {
    setMode(null);
    setTender({ kind: 'exact' });
    setOther('');
    setError(null);
  }, [bill.due]);

  useEffect(() => {
    if (!autoFocus) return;
    panel.current?.scrollIntoView({ block: 'nearest' });
    modeButtons.current.get('CASH')?.focus();
  }, [autoFocus]);

  useEffect(() => {
    // Only move focus that is already on the panel (or nowhere): never pull a cashier out of
    // another field, where a stray key could then pick a mode and Enter could pay.
    const active = document.activeElement;
    const ours = !active || active === document.body || panel.current?.contains(active);
    if (!ours) return;
    if (mode) confirmButton.current?.focus();
    else if (lastMode.current) modeButtons.current.get(lastMode.current)?.focus();
  }, [mode]);

  const cash = mode === 'CASH';
  const tendered =
    !cash || tender.kind === 'exact'
      ? undefined
      : tender.kind === 'note'
        ? tender.amount
        : parseRupees(other.trim());
  const outcome = typeof tendered === 'number' ? cashOutcome(bill.due, tendered) : null;
  const short = outcome && 'short' in outcome ? outcome.short : 0;
  const change = outcome && 'change' in outcome ? outcome.change : 0;
  const otherInvalid = cash && tender.kind === 'other' && tendered === null;
  const canConfirm = mode !== null && !payment.isPending && short === 0 && !otherInvalid;

  function choose(next: PaymentMode) {
    lastMode.current = next;
    setError(null);
    setTender({ kind: 'exact' });
    setOther('');
    setMode(next);
  }

  function back() {
    if (payment.isPending) return;
    setError(null);
    setMode(null);
  }

  function confirm() {
    if (!mode || !canConfirm) return;
    setError(null);
    payment.pay(
      { mode, amount: bill.due, ...(typeof tendered === 'number' ? { tendered } : {}) },
      {
        onSuccess: (updated) => {
          if (updated.status !== 'PAID') setMode(null);
        },
        onError: (failure) => setError(describeError(failure)),
      },
    );
  }

  useSettleKeys((key) => {
    if (mode === null) {
      const picked = MODES.find((m) => m.key === key);
      if (!picked) return false;
      choose(picked.mode);
      return true;
    }
    if (key === 'escape') {
      back();
      return true;
    }
    if (key === 'enter' && canConfirm) {
      confirm();
      return true;
    }
    return false;
  });

  const label =
    mode === 'CASH'
      ? `Confirm ${rupees(bill.due)} cash${change > 0 ? ` · change ${rupees(change)}` : ''}`
      : mode === 'UPI'
        ? `Confirm ${rupees(bill.due)} by UPI`
        : `Confirm ${rupees(bill.due)} by card`;

  return (
    <section
      ref={panel}
      aria-labelledby={`${id}-title`}
      className="flex basis-full flex-col gap-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3"
    >
      <h4 id={`${id}-title`} className="text-lg font-semibold tabular-nums">
        {`Bill ${bill.billNo} · ${rupees(bill.due)} due`}
      </h4>

      {mode === null ? (
        <>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Payment mode">
            {MODES.map((m) => (
              <button
                key={m.mode}
                ref={(node) => {
                  if (node) modeButtons.current.set(m.mode, node);
                  else modeButtons.current.delete(m.mode);
                }}
                type="button"
                aria-keyshortcuts={m.key.toUpperCase()}
                className="relative flex min-h-14 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface text-lg font-semibold shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 active:bg-primary-100"
                onClick={() => choose(m.mode)}
              >
                <PaymentIcon mode={m.mode} size="md" />
                {m.label}
                <kbd
                  aria-hidden="true"
                  className="absolute top-1 right-1.5 hidden font-sans text-xs text-subtle lg:block"
                >
                  {m.key.toUpperCase()}
                </kbd>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="min-h-11 self-start text-sm font-medium text-primary-800 underline-offset-4 hover:underline"
            onClick={onMore}
          >
            Split or part payment
          </button>
        </>
      ) : (
        <>
          {cash && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Cash received">
                <TenderButton
                  pressed={tender.kind === 'exact'}
                  onClick={() => setTender({ kind: 'exact' })}
                >
                  Exact
                </TenderButton>
                {suggestNotes(bill.due).map((note) => (
                  <TenderButton
                    key={note}
                    pressed={tender.kind === 'note' && tender.amount === note}
                    onClick={() => setTender({ kind: 'note', amount: note })}
                  >
                    {rupees(note)}
                  </TenderButton>
                ))}
              </div>
              <Field id={`${id}-other`} label="Other amount (₹)">
                <MoneyInput
                  id={`${id}-other`}
                  className="max-w-40"
                  value={other}
                  onChange={(e) => {
                    // An empty field means "no other amount": back to Exact, Confirm stays on.
                    setTender(e.target.value.trim() === '' ? { kind: 'exact' } : { kind: 'other' });
                    setOther(e.target.value);
                  }}
                />
              </Field>
              <p aria-live="polite" className="min-h-8 text-2xl font-semibold tabular-nums">
                {short > 0 ? (
                  <span className="text-red-700">{`${rupees(short)} more needed`}</span>
                ) : change > 0 ? (
                  <span className="text-green-800">{`Change ${rupees(change)}`}</span>
                ) : null}
              </p>
            </div>
          )}
          <ErrorNote message={error} />
          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirmButton}
              size="lg"
              className="min-w-0 flex-1 whitespace-normal"
              loading={payment.isPending}
              disabled={!canConfirm}
              onClick={confirm}
            >
              {label}
            </Button>
            <Button variant="secondary" size="lg" disabled={payment.isPending} onClick={back}>
              Back
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function TenderButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-md border px-4 text-base font-semibold tabular-nums transition-colors',
        pressed
          ? 'border-primary-700 bg-primary-700 text-white'
          : 'border-border-strong bg-surface hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}
