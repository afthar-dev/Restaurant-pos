import { useState } from 'react';
import { rupees } from './money';
import type { CartLine, MenuItem } from './types';

export const button =
  'min-h-12 rounded-xl px-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50';

/** A bottom sheet over the page, named for screen readers. */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-900/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

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

  return (
    <Sheet label={item.name} onClose={onClose}>
      <h2 className="text-xl font-semibold">{item.name}</h2>
      {item.description && <p className="text-slate-600">{item.description}</p>}

      {item.variants.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">Size</legend>
          {item.variants.map((v) => (
            <label key={v.id} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="size"
                className="h-5 w-5"
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
        <fieldset key={g.id} className="flex flex-col gap-2">
          <legend className="font-semibold">
            {g.name}
            {g.minSelect > 0 && <span className="ml-2 text-sm text-amber-700">Required</span>}
          </legend>
          {g.addons.map((a) => (
            <label key={a.id} className="flex min-h-11 items-center gap-3">
              <input
                type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                name={g.id}
                className="h-5 w-5"
                checked={(picked[g.id] ?? []).includes(a.id)}
                onChange={() => toggle(g.id, g.maxSelect, a.id)}
              />
              <span>{a.price > 0 ? `${a.name} +${rupees(a.price)}` : a.name}</span>
            </label>
          ))}
        </fieldset>
      ))}

      <label className="flex flex-col gap-1">
        <span className="font-semibold">Note (optional)</span>
        <input
          className="min-h-12 rounded-xl border border-slate-300 px-3"
          maxLength={140}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="One less"
          className={`${button} w-12 border border-slate-300`}
          disabled={quantity <= 1}
          onClick={() => setQuantity((q) => q - 1)}
        >
          −
        </button>
        <span className="w-8 text-center text-lg tabular-nums">{quantity}</span>
        <button
          type="button"
          aria-label="One more"
          className={`${button} w-12 border border-slate-300`}
          disabled={quantity >= 20}
          onClick={() => setQuantity((q) => q + 1)}
        >
          +
        </button>
        <button
          type="button"
          className={`${button} flex-1 bg-emerald-700 text-white`}
          disabled={!ready}
          onClick={add}
        >
          {`Add · ${rupees(unitPrice * quantity)}`}
        </button>
      </div>
    </Sheet>
  );
}
