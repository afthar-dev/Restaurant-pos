import { useState } from 'react';
import {
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  secondaryButton,
} from '@/shared/ui';
import { useCancelOrder } from '../../mutations';
import type { Order } from '../../types';

/** Cancels an order before anything reached the kitchen. */
export function CancelOrder({ order, onClosed }: { order: Order; onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useCancelOrder(order, onClosed);
  if (!open) {
    return (
      <button
        type="button"
        className={`${secondaryButton} self-start`}
        onClick={() => setOpen(true)}
      >
        Cancel order
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <Field id={`cancel-order-${order.id}`} label="Why cancel this order?">
        <input
          id={`cancel-order-${order.id}`}
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <ErrorNote message={cancel.isError ? describeError(cancel.error) : null} />
      <div className="flex gap-2">
        <button
          type="button"
          className={dangerButton}
          disabled={reason.trim().length < 3 || cancel.isPending}
          onClick={() => cancel.mutate(reason.trim())}
        >
          Yes, cancel order
        </button>
        <button type="button" className={secondaryButton} onClick={() => setOpen(false)}>
          Keep order
        </button>
      </div>
    </div>
  );
}
