import { parseQuantity } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import {
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
  Sheet,
} from '@/shared/ui';
import { useAdjustStock } from '../mutations';
import type { StockItem } from '../types';

/** Add or remove stock with a reason: wastage, staff meal, a delivery without a bill. */
export function AdjustSheet({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const [direction, setDirection] = useState<'remove' | 'add'>('remove');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const adjust = useAdjustStock(onClose);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const milli = parseQuantity(quantity);
    const problems: Record<string, string> = {};
    if (milli === null) problems.quantity = 'Enter a quantity like 1.5';
    if (reason.trim().length < 3) problems.reason = 'Give a short reason';
    setInvalid(problems);
    if (milli === null || Object.keys(problems).length > 0) return;
    adjust.mutate({
      id: item.id,
      qtyMilli: direction === 'add' ? milli : -milli,
      reason: reason.trim(),
    });
  }

  return (
    <Sheet label={`Adjust ${item.name}`} onClose={onClose}>
      <h3 className="text-lg font-semibold">Adjust {item.name}</h3>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="flex gap-2" role="group" aria-label="Add or remove">
          {(['remove', 'add'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={direction === d}
              className={`${secondaryButton} min-h-11 ${direction === d ? 'ring-2 ring-primary-700' : ''}`}
              onClick={() => setDirection(d)}
            >
              {d === 'remove' ? 'Remove' : 'Add'}
            </button>
          ))}
        </div>
        <Field id="adjust-qty" label={`Quantity (${item.unit})`} error={invalid.quantity}>
          <input
            id="adjust-qty"
            inputMode="decimal"
            className={inputClass}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field id="adjust-reason" label="Reason" error={invalid.reason}>
          <input
            id="adjust-reason"
            className={inputClass}
            placeholder="Spoiled, staff meal…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <ErrorNote message={adjust.isError ? describeError(adjust.error) : null} />
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={adjust.isPending}>
            Save
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
