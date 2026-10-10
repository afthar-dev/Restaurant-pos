import { useState } from 'react';
import { rupees } from '@/shared/lib/money';
import type { CartLine } from '@/features/cart';
import { Minus, Plus } from 'lucide-react';
import { button, FoodMark, Sheet } from '@/shared/ui';
import type { MenuItem } from '../types';

/** Size, add-ons, note and quantity for one dish; Add waits until required choices are made. */
export function ItemSheet({
  item,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  onAdd: (line: CartLine) => void;
  onClose: () => void;
}) {
  const [variantId, setVariantId] = useState(item.variants[0]!.id);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const variant = item.variants.find((v) => v.id === variantId)!;
  const addonIds = item.addonGroups.flatMap((g) => picked[g.id] ?? []);
  const addons = item.addonGroups.flatMap((g) => g.addons).filter((a) => addonIds.includes(a.id));
  const unitPrice = variant.price + addons.reduce((sum, a) => sum + a.price, 0);
  const ready = item.addonGroups.every((g) => (picked[g.id]?.length ?? 0) >= g.minSelect);

  function toggle(groupId: string, maxSelect: number, addonId: string) {
    setPicked((current) => {
      const chosen = current[groupId] ?? [];
      if (chosen.includes(addonId)) {
        return { ...current, [groupId]: chosen.filter((id) => id !== addonId) };
      }
      if (maxSelect === 1) return { ...current, [groupId]: [addonId] };
      if (chosen.length >= maxSelect) return current;
      return { ...current, [groupId]: [...chosen, addonId] };
    });
  }

  function add() {
    const name = variant.name === 'Regular' ? item.name : `${item.name} (${variant.name})`;
    const extras = addons.map((a) => a.name);
    onAdd({
      key: `${variantId}|${[...addonIds].sort().join(',')}|${note.trim()}`,
      variantId,
      addonIds,
      quantity,
      ...(note.trim() ? { note: note.trim() } : {}),
      label: extras.length > 0 ? `${name} + ${extras.join(', ')}` : name,
      unitPrice,
    });
  }

  const option =
    'flex min-h-12 items-center gap-3 rounded-xl border border-border px-3 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-50';
  return (
    <Sheet label={item.name} onClose={onClose}>
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="-mx-4 -mt-4 aspect-video w-[calc(100%+2rem)] max-w-none object-cover"
        />
      )}
      <div className="flex flex-col gap-1 pr-12">
        <FoodMark type={item.foodType} size={16} />
        <h2 className="text-xl font-bold">{item.name}</h2>
        {item.description && <p className="text-sm text-muted">{item.description}</p>}
      </div>

      {item.variants.length > 1 && (
        <fieldset className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
          <legend className="float-left mb-1 w-full font-semibold">Size</legend>
          {item.variants.map((v) => (
            <label key={v.id} className={`${option} bg-surface`}>
              <input
                type="radio"
                name="size"
                className="size-5 accent-primary-700"
                checked={v.id === variantId}
                onChange={() => setVariantId(v.id)}
              />
              <span className="flex-1">{v.name}</span>
              <span className="tabular-nums">{rupees(v.price)}</span>
            </label>
          ))}
        </fieldset>
      )}

      {item.addonGroups.map((g) => (
        <fieldset key={g.id} className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
          <legend className="float-left mb-1 flex w-full items-center gap-2 font-semibold">
            {g.name}
            {g.minSelect > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                Required
              </span>
            ) : (
              g.maxSelect > 1 && (
                <span className="text-xs font-normal text-muted">{`Pick up to ${g.maxSelect}`}</span>
              )
            )}
          </legend>
          {g.addons.map((a) => (
            <label key={a.id} className={`${option} bg-surface`}>
              <input
                type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                name={g.id}
                className="size-5 accent-primary-700"
                checked={(picked[g.id] ?? []).includes(a.id)}
                onChange={() => toggle(g.id, g.maxSelect, a.id)}
              />
              <span className="flex-1">{a.name}</span>{' '}
              {a.price > 0 && (
                <span className="tabular-nums text-muted">{`+${rupees(a.price)}`}</span>
              )}
            </label>
          ))}
        </fieldset>
      ))}

      <label className="flex flex-col gap-1">
        <span className="font-semibold">Note (optional)</span>
        <input
          className="min-h-12 rounded-xl border border-border-strong bg-surface px-3"
          maxLength={140}
          placeholder="Less spicy, no onion…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {/* Pinned to the bottom of the sheet however long the choices are. */}
      <div
        data-sheet-footer
        className="sticky -bottom-4 -mx-4 -mb-4 flex items-center gap-3 border-t border-border bg-surface p-4"
      >
        <div className="flex h-12 items-center rounded-xl border border-primary-300 text-primary-800">
          <button
            type="button"
            aria-label="One less"
            className="inline-flex size-12 items-center justify-center disabled:opacity-40"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => q - 1)}
          >
            <Minus aria-hidden="true" className="size-5" />
          </button>
          <span className="w-6 text-center font-bold tabular-nums">{quantity}</span>
          <button
            type="button"
            aria-label="One more"
            className="inline-flex size-12 items-center justify-center disabled:opacity-40"
            disabled={quantity >= 20}
            onClick={() => setQuantity((q) => q + 1)}
          >
            <Plus aria-hidden="true" className="size-5" />
          </button>
        </div>
        <button
          type="button"
          className={`${button} flex-1 bg-primary-700 text-white`}
          disabled={!ready}
          onClick={add}
        >
          {`Add item · ${rupees(unitPrice * quantity)}`}
        </button>
      </div>
    </Sheet>
  );
}
