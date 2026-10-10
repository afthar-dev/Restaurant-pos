import { useState } from 'react';
import { rupees } from '@/shared/lib/money';
import { FOOD_LABEL, FoodMark } from '@/shared/ui';
import type { Menu as MenuData, MenuItem } from '../types';

const fromPrice = (item: MenuItem) => {
  const prices = item.variants.map((v) => v.price);
  const lowest = Math.min(...prices);
  return item.variants.length > 1 ? `from ${rupees(lowest)}` : rupees(lowest);
};

/** Category chips and the dishes that can be ordered right now. */
export function Menu({ menu, onPick }: { menu: MenuData; onPick: (item: MenuItem) => void }) {
  const [categoryId, setCategoryId] = useState(menu.categories[0]?.id ?? null);
  const active = menu.categories.find((c) => c.id === categoryId) ?? menu.categories[0];

  if (menu.categories.length === 0) {
    return <p className="text-muted">Nothing can be ordered right now.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Menu" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {menu.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === active?.id}
            className={`min-h-11 shrink-0 rounded-full px-4 font-medium ${
              c.id === active?.id ? 'bg-primary-700 text-white' : 'bg-surface-2 text-text'
            }`}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {active?.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-label={`${item.name}, ${FOOD_LABEL[item.foodType]}, ${fromPrice(item)}`}
              className="flex min-h-16 w-full items-center justify-between gap-3 py-2 text-left"
              onClick={() => onPick(item)}
            >
              <span className="flex items-start gap-2">
                <FoodMark type={item.foodType} className="mt-1" />
                <span>
                  <span className="block text-base font-medium">{item.name}</span>
                  {item.description && (
                    <span className="block text-sm text-muted">{item.description}</span>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-sm tabular-nums text-muted">{fromPrice(item)}</span>
                {item.imageUrl && (
                  // The row already names the dish, so the photo needs no text of its own.
                  <img
                    src={item.imageUrl}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="size-16 rounded-lg object-cover"
                  />
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
