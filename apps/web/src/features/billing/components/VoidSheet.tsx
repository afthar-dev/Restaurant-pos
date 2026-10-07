import { useId, useState, type FormEvent } from 'react';
import { apiFetch } from '@/shared/api/http';
import { useCan } from '@/shared/session/store';
import { ManagerApproval } from '@/features/auth/components/ManagerApproval';
import {
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  secondaryButton,
  Sheet,
} from '@/shared/ui';
import { useRefreshOrder } from '@/features/orders/mutations';
import type { Bill } from '@/features/orders/types';

/**
 * Voids a bill (spec §5.4): the number is kept and the order reopens for a new bill. A cashier
 * needs a manager to approve with their PIN.
 */
export function VoidSheet({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const id = useId();
  const canVoid = useCan('bill.void');
  const refresh = useRefreshOrder();
  const [reason, setReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(overrideToken?: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/bills/${bill.id}/void`, {
        method: 'POST',
        headers: overrideToken ? { 'x-override-token': overrideToken } : {},
        body: { reason: reason.trim() },
      });
      await refresh(bill.orderId);
      onDone();
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) return setError('Give a short reason.');
    if (canVoid) void send();
    else setApproving(true);
  }

  return (
    <Sheet label={`Void bill ${bill.billNo}`} onClose={onDone}>
      <h3 className="text-lg font-semibold">Void bill {bill.billNo}</h3>
      <p className="text-sm text-slate-600">
        The bill number stays on record and the order opens again for a new bill.
        {bill.paid > 0 && ' Return the money or collect it again on the new bill.'}
      </p>
      {approving ? (
        <ManagerApproval
          permission="bill.void"
          message="A manager must approve this void."
          onApproved={(token) => {
            setApproving(false);
            void send(token);
          }}
          onCancel={() => setApproving(false)}
        />
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <Field id={`${id}-reason`} label="Reason">
            <input
              id={`${id}-reason`}
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={`${dangerButton} min-h-11`} disabled={busy}>
              Void bill
            </button>
            <button type="button" className={`${secondaryButton} min-h-11`} onClick={onDone}>
              Keep it
            </button>
          </div>
        </form>
      )}
      <ErrorNote message={error} />
    </Sheet>
  );
}
