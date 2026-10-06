import { useState } from 'react';
import { rupees } from './money';
import type { Menu as MenuData, MenuItem } from './types';

const DOT: Record<MenuItem['foodType'], string> = {
  VEG: 'bg-emerald-600',
  NON_VEG: 'bg-red-600',
  EGG: 'bg-amber-500',
};

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
    return <p className="text-slate-600">Nothing can be ordered right now.</p>;
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
              c.id === active?.id ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-800'
            }`}
            onClick={() => setCategoryId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <ul className="flex flex-col divide-y divide-slate-100">
        {active?.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-label={`${item.name}, ${fromPrice(item)}`}
              className="flex min-h-16 w-full items-center justify-between gap-3 py-2 text-left"
              onClick={() => onPick(item)}
            >
              <span className="flex items-start gap-2">
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[item.foodType]}`} />
                <span>
                  <span className="block text-base font-medium">{item.name}</span>
                  {item.description && (
                    <span className="block text-sm text-slate-500">{item.description}</span>
                  )}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-slate-700">
                {fromPrice(item)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
