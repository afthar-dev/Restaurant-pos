import { PAYMENT_MODES, type PaymentMode } from '@rpos/shared';
import { useId, useState, type FormEvent } from 'react';
import { ManagerApproval } from '@/features/auth';
import { ApiError } from '@/shared/api/http';
import { rupees } from '@/shared/lib/money';
import {
  describeError,
  ErrorNote,
  noReason,
  PaymentIcon,
  primaryButton,
  ReasonPicker,
  reasonReady,
  reasonRequest,
  secondaryButton,
  Sheet,
} from '@/shared/ui';
import { useChangePaymentMode } from '../mutations';
import type { Bill, BillPayment } from '../types';

const MODE_LABEL: Record<PaymentMode, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' };

interface Change {
  mode: PaymentMode;
  reasonCode: string;
  note?: string;
  overrideToken?: string;
}

/**
 * Fixes the mode of a payment taken today (it went in as the wrong one). Expected cash follows
 * the corrected mode. A manager's PIN is asked for only when the API says it is needed.
 */
export function ChangeModeSheet({
  bill,
  payment,
  onDone,
}: {
  bill: Bill;
  payment: BillPayment;
  onDone: () => void;
}) {
  const id = useId();
  const change = useChangePaymentMode(bill, payment.id);
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [reason, setReason] = useState(noReason);
  const [error, setError] = useState<string | null>(null);
  // The request waiting for a manager's PIN.
  const [pending, setPending] = useState<Change | null>(null);

  function send(body: Change) {
    setError(null);
    change.mutate(body, {
      onSuccess: onDone,
      onError: (failure) => {
        if (failure instanceof ApiError && failure.code === 'APPROVAL_REQUIRED') {
          // A bad or used token comes back the same way: ask again.
          setPending(body);
          if (body.overrideToken) setError('That approval did not work. Ask the manager again.');
        } else {
          setPending(null);
          setError(describeError(failure));
        }
      },
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!mode) return setError('Choose the right mode.');
    if (!reasonReady(reason)) return setError('Choose a reason.');
    send({ mode, ...reasonRequest(reason) });
  }

  return (
    <Sheet label="Change payment mode" onClose={onDone}>
      <h3 className="text-lg font-semibold">Change payment mode</h3>
      <p className="text-sm text-muted">
        {`Bill ${bill.billNo}: ${rupees(payment.amount)} was recorded as ${MODE_LABEL[payment.mode]}. Fix it today only; the expected cash follows.`}
      </p>
      {pending ? (
        <div className="flex flex-col gap-3">
          <ManagerApproval
            permission="day.openClose"
            message="A manager must approve changing a payment mode."
            onApproved={(token) => {
              const { overrideToken: _old, ...rest } = pending;
              setPending(null);
              send({ ...rest, overrideToken: token });
            }}
            onCancel={() => setPending(null)}
          />
          <ErrorNote message={error} />
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Right payment mode">
            {PAYMENT_MODES.filter((m) => m !== payment.mode).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border text-base font-semibold ${
                  mode === m
                    ? 'border-primary-700 bg-primary-700 text-white'
                    : 'border-border-strong bg-surface'
                }`}
                onClick={() => setMode(m)}
              >
                <PaymentIcon mode={m} size="md" />
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <ReasonPicker
            kind="paymentMode"
            idPrefix={`${id}-reason`}
            value={reason}
            onChange={setReason}
          />
          <ErrorNote message={error} />
          <div className="flex gap-2">
            <button
              type="submit"
              className={`${primaryButton} min-h-11`}
              disabled={change.isPending}
            >
              Change mode
            </button>
            <button type="button" className={`${secondaryButton} min-h-11`} onClick={onDone}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
