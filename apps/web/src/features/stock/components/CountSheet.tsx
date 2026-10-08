import { formatQuantity, parseQuantity } from '@rpos/shared';
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
import { useCountStock } from '../mutations';
import { quantityLabel, type StockItem } from '../types';

/** A physical count: the difference from the books is recorded, so variance stays visible. */
export function CountSheet({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState<string | undefined>();
  const [result, setResult] = useState<string | null>(null);
  const count = useCountStock((difference) =>
    setResult(
      difference === 0
        ? 'Matches the books. Nothing to record.'
        : `Difference ${difference > 0 ? '+' : '−'}${quantityLabel(Math.abs(difference), item.unit)} recorded.`,
    ),
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = counted.trim();
    // Zero is a valid count (the item ran out); parseQuantity only takes positive amounts.
    const countedMilli = /^0*(\.0{0,3})?$/.test(text) && text !== '' ? 0 : parseQuantity(text);
    if (countedMilli === null) return setInvalid('Enter a quantity like 1.5');
    setInvalid(undefined);
    setResult(null);
    count.mutate({ id: item.id, countedMilli, note: note.trim() || undefined });
  }

  return (
    <Sheet label={`Count ${item.name}`} onClose={onClose}>
      <h3 className="text-lg font-semibold">Count {item.name}</h3>
      <p className="text-sm text-muted">
        The books say {quantityLabel(item.currentMilli, item.unit)}.
      </p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field id="count-qty" label={`Counted (${item.unit})`} error={invalid}>
          <input
            id="count-qty"
            inputMode="decimal"
            className={inputClass}
            placeholder={formatQuantity(Math.max(item.currentMilli, 0))}
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
        </Field>
        <Field id="count-note" label="Note (optional)">
          <input
            id="count-note"
            className={inputClass}
            maxLength={140}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {result && (
          <p role="status" className="text-sm text-green-800">
            {result}
          </p>
        )}
        <ErrorNote message={count.isError ? describeError(count.error) : null} />
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={count.isPending}>
            Save count
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </Sheet>
  );
}
