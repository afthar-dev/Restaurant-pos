import { useState, type FormEvent } from 'react';
import { ApproverFields, isPin, requestOverride } from '@/features/auth';
import { useCan } from '@/shared/session/store';
import {
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  noReason,
  ReasonPicker,
  reasonReady,
  reasonRequest,
  secondaryButton,
} from '@/shared/ui';
import { useCancelLine } from '../../mutations';
import type { Order, OrderLine } from '../../types';

/** Cancels a dish the kitchen already has; staff without the right need a manager's PIN. */
export function CancelLineDialog({
  order,
  line,
  onDone,
}: {
  order: Order;
  line: OrderLine;
  onDone: () => void;
}) {
  const canCancel = useCan('item.cancelAfterKot');
  const cancel = useCancelLine(order, line, onDone);
  const [reason, setReason] = useState(noReason);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reasonReady(reason)) return setError('Choose a reason.');
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > line.quantity) {
      return setError(`Cancel between 1 and ${line.quantity}.`);
    }
    if (!canCancel && (!approverId || !isPin(pin))) {
      return setError('A manager must pick their name and enter their PIN.');
    }
    setError(null);
    cancel.mutate({
      reason: reasonRequest(reason),
      quantity: qty,
      overrideToken: canCancel
        ? undefined
        : () => requestOverride(approverId, pin, 'item.cancelAfterKot'),
    });
  }

  return (
    <form
      role="dialog"
      aria-label={`Cancel ${line.itemName}`}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3"
    >
      <p className="text-sm text-red-900">
        This dish is already in the kitchen. A cancellation ticket goes to {''}
        the same station.
      </p>
      <ReasonPicker
        kind="cancel"
        idPrefix={`cancel-reason-${line.id}`}
        value={reason}
        onChange={setReason}
      />
      {line.quantity > 1 && (
        <Field id={`cancel-qty-${line.id}`} label="How many">
          <input
            id={`cancel-qty-${line.id}`}
            type="number"
            min={1}
            max={line.quantity}
            className={`${inputClass} w-24`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
      )}
      {!canCancel && (
        <ApproverFields
          idPrefix={`cancel-${line.id}`}
          approverId={approverId}
          pin={pin}
          onApprover={setApproverId}
          onPin={setPin}
        />
      )}
      <ErrorNote message={error ?? (cancel.isError ? describeError(cancel.error) : null)} />
      <div className="flex gap-2">
        <button type="submit" className={dangerButton} disabled={cancel.isPending}>
          Cancel dish
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Keep it
        </button>
      </div>
    </form>
  );
}
