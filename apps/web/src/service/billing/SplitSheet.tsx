import { useState } from 'react';
import { primaryButton, secondaryButton, Sheet } from '../../components/ui';
import type { OrderLine } from '../types';

/** Pick how many of each dish go on a separate bill (split by items, spec §5.4). */
export function SplitSheet({
  lines,
  busy,
  onBill,
  onClose,
}: {
  lines: OrderLine[];
  busy: boolean;
  onBill: (lines: { orderItemId: string; quantity: number }[]) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const left = (l: OrderLine) => l.quantity - l.billedQuantity;
  const picked = Object.entries(chosen)
    .filter(([, quantity]) => quantity > 0)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));

  const step = (line: OrderLine, by: number) =>
    setChosen((c) => ({
      ...c,
      [line.id]: Math.min(left(line), Math.max(0, (c[line.id] ?? 0) + by)),
    }));

  return (
    <Sheet label="Split bill" onClose={onClose}>
      <h3 className="text-lg font-semibold">Split bill</h3>
      <p className="text-sm text-slate-600">Choose the dishes for this bill.</p>
      <ul className="flex flex-col divide-y divide-slate-100">
        {lines
          .filter((l) => left(l) > 0)
          .map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {l.itemName}
                {l.variantName !== 'Regular' && ` (${l.variantName})`}
                <span className="block text-xs text-slate-500">{left(l)} not billed</span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`One less ${l.itemName}`}
                  className={`${secondaryButton} h-11 w-11`}
                  onClick={() => step(l, -1)}
                >
                  −
                </button>
                <span className="w-6 text-center tabular-nums">{chosen[l.id] ?? 0}</span>
                <button
                  type="button"
                  aria-label={`One more ${l.itemName}`}
                  className={`${secondaryButton} h-11 w-11`}
                  onClick={() => step(l, 1)}
                >
                  +
                </button>
              </span>
            </li>
          ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          className={`${primaryButton} min-h-11`}
          disabled={picked.length === 0 || busy}
          onClick={() => onBill(picked)}
        >
          Bill selected
        </button>
        <button type="button" className={`${secondaryButton} min-h-11`} onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
