import { useId, useState, type FormEvent } from 'react';
import { useCan } from '@/shared/session/store';
import { ManagerApproval } from '@/features/auth';
import {
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  secondaryButton,
  Sheet,
} from '@/shared/ui';
import { useVoidBill } from '../mutations';
import type { Bill } from '../types';

/**
 * Voids a bill (spec §5.4): the number is kept and the order reopens for a new bill. A cashier
 * needs a manager to approve with their PIN.
 */
export function VoidSheet({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const id = useId();
  const canVoid = useCan('bill.void');
  const voiding = useVoidBill(bill);
  const [reason, setReason] = useState('');
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function send(overrideToken?: string) {
    setError(null);
    voiding.mutate(
      { reason: reason.trim(), overrideToken },
      { onSuccess: onDone, onError: (failure) => setError(describeError(failure)) },
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) return setError('Give a short reason.');
    if (canVoid) send();
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
            send(token);
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
            <button
              type="submit"
              className={`${dangerButton} min-h-11`}
              disabled={voiding.isPending}
            >
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
