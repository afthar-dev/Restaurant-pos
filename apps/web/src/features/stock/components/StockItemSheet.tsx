import {
  formatQuantity,
  parseQuantity,
  STOCK_UNITS,
  stockItemSchema,
  type StockUnit,
} from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  fieldErrors,
  inputClass,
  primaryButton,
  secondaryButton,
  Sheet,
  type FieldErrors,
} from '@/shared/ui';
import { useArchiveStockItem, useSaveStockItem } from '../mutations';
import type { StockItem } from '../types';

/** Add a stock item, or edit its name, unit and low-stock level. */
export function StockItemSheet({
  existing,
  onClose,
}: {
  existing: StockItem | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [unit, setUnit] = useState<StockUnit>(existing?.unit ?? 'kg');
  const [minLevel, setMinLevel] = useState(
    existing && existing.minLevelMilli > 0 ? formatQuantity(existing.minLevelMilli) : '',
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useSaveStockItem(existing, onClose);
  const [removing, setRemoving] = useState(false);
  const archive = useArchiveStockItem(onClose);
  const failed = [save, archive].find((m) => m.isError);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const minLevelMilli = minLevel.trim() === '' ? 0 : parseQuantity(minLevel);
    if (minLevelMilli === null) {
      setErrors({ minLevelMilli: 'Enter a quantity like 1.5, or leave it empty' });
      return;
    }
    const parsed = stockItemSchema.safeParse({ name: name.trim(), unit, minLevelMilli });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const title = existing ? `Edit ${existing.name}` : 'New stock item';
  return (
    <Sheet label={title} onClose={onClose}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Field id="stock-name" label="Name" error={errors.name}>
          <input
            id="stock-name"
            className={inputClass}
            placeholder="Onion"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="stock-unit" label="Unit" error={errors.unit}>
          <select
            id="stock-unit"
            className={inputClass}
            value={unit}
            onChange={(e) => setUnit(e.target.value as StockUnit)}
          >
            {STOCK_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="stock-min"
          label={`Alert when at or below (${unit})`}
          error={errors.minLevelMilli}
          hint="Leave empty for no alert."
        >
          <input
            id="stock-min"
            inputMode="decimal"
            className={inputClass}
            value={minLevel}
            onChange={(e) => setMinLevel(e.target.value)}
          />
        </Field>
        <ErrorNote message={failed ? describeError(failed.error) : null} />
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={save.isPending}>
            Save
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
      {existing &&
        (removing ? (
          <ConfirmBar
            question={`Remove ${existing.name} from the stock list? Its history is kept.`}
            confirmLabel={`Yes, remove ${existing.name}`}
            onConfirm={() => archive.mutate(existing)}
            onCancel={() => setRemoving(false)}
            busy={archive.isPending}
          />
        ) : (
          <button
            type="button"
            className="self-start text-sm text-red-700 underline"
            onClick={() => setRemoving(true)}
          >
            Remove this item
          </button>
        ))}
    </Sheet>
  );
}
