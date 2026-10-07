import { paiseToRupeesInput, parseRupees } from '@rpos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '@/shared/api/http';
import { ManagerApproval } from '@/features/auth/components/ManagerApproval';
import {
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
  Sheet,
} from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
import type { Bill, Discount } from '@/features/orders/types';

type Kind = Discount['kind'];

const sameDiscount = (a: Discount | null, b: Discount | null) =>
  a?.kind === b?.kind && a?.value === b?.value;

/** A bill discount (₹ or %) and ₹ off single dishes, with a reason (spec §5.4). */
export function DiscountSheet({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>(bill.discount?.kind ?? 'PERCENT');
  const [value, setValue] = useState(() => {
    if (!bill.discount) return '';
    return bill.discount.kind === 'PERCENT'
      ? String(bill.discount.value / 100)
      : paiseToRupeesInput(bill.discount.value);
  });
  const [lineOff, setLineOff] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      bill.lines.map((l) => [
        l.id,
        l.discount?.kind === 'FLAT' ? paiseToRupeesInput(l.discount.value) : '',
      ]),
    ),
  );
  const [reason, setReason] = useState(bill.discountReason ?? '');
  const [error, setError] = useState<string | null>(null);
  const [needsManager, setNeedsManager] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** The request body, or an error message for the person at the counter. */
  function buildRequest(): { body: object } | { problem: string } {
    let billDiscount: Discount | null = null;
    if (value.trim() !== '') {
      if (kind === 'PERCENT') {
        const pct = Number(value);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
          return { problem: 'Enter a percentage from 0 to 100.' };
        }
        billDiscount = pct > 0 ? { kind, value: Math.round(pct * 100) } : null;
      } else {
        const paise = parseRupees(value);
        if (paise === null) return { problem: 'Enter the discount in rupees, like 50.' };
        billDiscount = paise > 0 ? { kind, value: paise } : null;
      }
    }
    const items: { billItemId: string; discount: Discount | null }[] = [];
    for (const line of bill.lines) {
      const raw = (lineOff[line.id] ?? '').trim();
      const paise = raw === '' ? 0 : parseRupees(raw);
      if (paise === null) return { problem: `Enter the rupees off ${line.itemName}, like 20.` };
      const next: Discount | null = paise > 0 ? { kind: 'FLAT', value: paise } : null;
      if (!sameDiscount(next, line.discount)) items.push({ billItemId: line.id, discount: next });
    }
    const anything =
      billDiscount !== null ||
      bill.lines.some((l) => {
        const raw = (lineOff[l.id] ?? '').trim();
        return raw !== '' && (parseRupees(raw) ?? 0) > 0;
      });
    if (anything && reason.trim().length < 3) return { problem: 'Give a reason for the discount.' };
    return {
      body: {
        bill: billDiscount,
        items,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
    };
  }

  async function send(overrideToken?: string) {
    const built = buildRequest();
    if ('problem' in built) return setError(built.problem);
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/api/bills/${bill.id}/discount`, {
        method: 'PUT',
        headers: {
          'If-Match': String(bill.version),
          ...(overrideToken ? { 'x-override-token': overrideToken } : {}),
        },
        body: built.body,
      });
      await queryClient.invalidateQueries({ queryKey: ['bills', bill.orderId] });
      onDone();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'DISCOUNT_OVER_LIMIT') {
        const allowed = Number(failure.body.allowed ?? 0);
        setNeedsManager(`This discount needs a manager. The cashier limit is ${rupees(allowed)}.`);
      } else {
        setError(describeError(failure));
        if (failure instanceof ApiError && failure.code === 'BILL_CHANGED') {
          void queryClient.invalidateQueries({ queryKey: ['bills', bill.orderId] });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  return (
    <Sheet label={`Discount on bill ${bill.billNo}`} onClose={onDone}>
      <h3 className="text-lg font-semibold">Discount on bill {bill.billNo}</h3>
      {needsManager ? (
        <ManagerApproval
          permission="discount.unlimited"
          message={needsManager}
          onApproved={(token) => {
            setNeedsManager(null);
            void send(token);
          }}
          onCancel={() => setNeedsManager(null)}
        />
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <div className="flex gap-2" role="group" aria-label="Discount type">
            {(['PERCENT', 'FLAT'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                className={`${secondaryButton} min-h-11 ${kind === k ? 'ring-2 ring-emerald-700' : ''}`}
                onClick={() => setKind(k)}
              >
                {k === 'PERCENT' ? 'Percent' : 'Rupees'}
              </button>
            ))}
          </div>
          <Field
            id={`${id}-value`}
            label={kind === 'PERCENT' ? 'Discount on the bill (%)' : 'Discount on the bill (₹)'}
          >
            <input
              id={`${id}-value`}
              inputMode="decimal"
              className={inputClass}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <details className="rounded-md border border-slate-200 p-2">
            <summary className="cursor-pointer text-sm font-medium">Discount a dish</summary>
            <div className="mt-2 flex flex-col gap-2">
              {bill.lines.map((l) => (
                <Field key={l.id} id={`${id}-${l.id}`} label={`₹ off ${l.itemName}`}>
                  <input
                    id={`${id}-${l.id}`}
                    inputMode="decimal"
                    className={inputClass}
                    value={lineOff[l.id] ?? ''}
                    onChange={(e) => setLineOff((o) => ({ ...o, [l.id]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          </details>
          <Field id={`${id}-reason`} label="Reason">
            <input
              id={`${id}-reason`}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <ErrorNote message={error} />
          <div className="flex gap-2">
            <button type="submit" className={`${primaryButton} min-h-11`} disabled={busy}>
              Apply discount
            </button>
            <button type="button" className={`${secondaryButton} min-h-11`} onClick={onDone}>
              Close
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
