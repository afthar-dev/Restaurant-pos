import { rupees } from '@/shared/lib/money';
import type { OrderType } from '@rpos/shared';
import { useState } from 'react';
import { inputClass, primaryButton, secondaryButton, Sheet } from '@/shared/ui';
import { type MenuAddonGroup, type MenuItem, type MenuVariant } from '@/pages/admin/menu-types';

export interface NewLine {
  variantId: string;
  quantity: number;
  addonIds: string[];
  note?: string;
}

export function unitPrice(variant: MenuVariant, orderType: OrderType): number {
  return orderType === 'PARCEL' ? variant.parcelPrice : variant.dineInPrice;
}

function requirement(group: MenuAddonGroup): string {
  if (group.minSelect > 0 && group.minSelect === group.maxSelect) return `Pick ${group.minSelect}`;
  if (group.minSelect > 0) return `Pick at least ${group.minSelect}, up to ${group.maxSelect}`;
  return `Optional, up to ${group.maxSelect}`;
}

/** Size, add-ons, note and quantity for one dish. "Add" stays off until required picks are made. */
export function ItemPicker({
  item,
  orderType,
  busy,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  orderType: OrderType;
  busy?: boolean;
  onAdd: (line: NewLine) => void;
  onClose: () => void;
}) {
  const [variantId, setVariantId] = useState(item.variants[0]!.id);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);

  const variant = item.variants.find((v) => v.id === variantId)!;
  const allAddons = item.addonGroups.flatMap((g) => g.addons);
  const pickedIds = Object.values(picked).flat();
  const addonTotal = pickedIds.reduce(
    (sum, id) => sum + (allAddons.find((a) => a.id === id)?.price ?? 0),
    0,
  );
  const total = (unitPrice(variant, orderType) + addonTotal) * quantity;
  const ready = item.addonGroups.every((g) => (picked[g.id]?.length ?? 0) >= g.minSelect);

  function toggle(group: MenuAddonGroup, addonId: string) {
    setPicked((current) => {
      const chosen = current[group.id] ?? [];
      if (chosen.includes(addonId)) {
        return { ...current, [group.id]: chosen.filter((id) => id !== addonId) };
      }
      // A "pick 1" group behaves like radio buttons.
      if (group.maxSelect === 1) return { ...current, [group.id]: [addonId] };
      if (chosen.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...chosen, addonId] };
    });
  }

  return (
    <Sheet label={item.name} onClose={onClose}>
      <h3 className="text-lg font-semibold">{item.name}</h3>

      {item.variants.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Size</legend>
          <div className="flex flex-wrap gap-2">
            {item.variants.map((v) => (
              <label
                key={v.id}
                className={`flex min-h-11 items-center gap-2 rounded-md border px-3 ${
                  v.id === variantId ? 'border-emerald-700 bg-emerald-50' : 'border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name={`size-${item.id}`}
                  checked={v.id === variantId}
                  onChange={() => setVariantId(v.id)}
                  aria-label={`${v.name} ${rupees(unitPrice(v, orderType))}`}
                />
                <span>
                  {v.name} {rupees(unitPrice(v, orderType))}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {item.addonGroups.map((group) => {
        const chosen = picked[group.id] ?? [];
        return (
          <fieldset key={group.id} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">
              {group.name} <span className="font-normal text-slate-500">{requirement(group)}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {group.addons.map((addon) => {
                const label = !addon.isAvailable
                  ? `${addon.name} (out of stock)`
                  : addon.price > 0
                    ? `${addon.name} +${rupees(addon.price)}`
                    : addon.name;
                const atMax = chosen.length >= group.maxSelect && group.maxSelect > 1;
                return (
                  <label
                    key={addon.id}
                    className={`flex min-h-11 items-center gap-2 rounded-md border px-3 ${
                      chosen.includes(addon.id)
                        ? 'border-emerald-700 bg-emerald-50'
                        : 'border-slate-300'
                    } ${addon.isAvailable ? '' : 'opacity-50'}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={label}
                      checked={chosen.includes(addon.id)}
                      disabled={!addon.isAvailable || (atMax && !chosen.includes(addon.id))}
                      onChange={() => toggle(group, addon.id)}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`note-${item.id}`}>
        Note for the kitchen
        <input
          id={`note-${item.id}`}
          className={inputClass}
          placeholder="Less spicy, no onion…"
          maxLength={140}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="One less"
          className={`${secondaryButton} h-11 w-11 text-lg`}
          disabled={quantity <= 1}
          onClick={() => setQuantity((q) => q - 1)}
        >
          −
        </button>
        <span className="w-8 text-center text-lg font-semibold tabular-nums">{quantity}</span>
        <button
          type="button"
          aria-label="One more"
          className={`${secondaryButton} h-11 w-11 text-lg`}
          disabled={quantity >= 99}
          onClick={() => setQuantity((q) => q + 1)}
        >
          +
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={`${primaryButton} min-h-11 flex-1`}
          disabled={!ready || busy}
          onClick={() =>
            onAdd({
              variantId,
              quantity,
              addonIds: pickedIds,
              ...(note.trim() ? { note: note.trim() } : {}),
            })
          }
        >
          Add to order · {rupees(total)}
        </button>
        <button type="button" className={secondaryButton} onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
