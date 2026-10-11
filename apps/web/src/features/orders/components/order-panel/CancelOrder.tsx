import { useState } from 'react';
import {
  dangerButton,
  describeError,
  ErrorNote,
  noReason,
  ReasonPicker,
  reasonReady,
  reasonRequest,
  secondaryButton,
} from '@/shared/ui';
import { useCancelOrder } from '../../mutations';
import type { Order } from '../../types';

/** Cancels an order before anything reached the kitchen. */
export function CancelOrder({ order, onClosed }: { order: Order; onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(noReason);
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
      <p className="text-sm font-medium">Why cancel this order?</p>
      <ReasonPicker
        kind="cancel"
        idPrefix={`cancel-order-${order.id}`}
        value={reason}
        onChange={setReason}
      />
      <ErrorNote message={cancel.isError ? describeError(cancel.error) : null} />
      <div className="flex gap-2">
        <button
          type="button"
          className={dangerButton}
          disabled={!reasonReady(reason) || cancel.isPending}
          onClick={() => cancel.mutate(reasonRequest(reason))}
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
