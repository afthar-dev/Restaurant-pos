import type { OrderType } from '@rpos/shared';
import { useState } from 'react';
import { describeError, ErrorNote, inputClass } from '@/shared/ui';
import { FOOD_DOT, type MenuItem, useMenu } from '@/features/menu';
import { rupees } from '@/shared/lib/money';
import { ItemPicker, unitPrice } from './ItemPicker';
import { useAddItem } from '../mutations';

function tileLabel(item: MenuItem, orderType: OrderType): string {
  if (!item.isAvailable) return `${item.name}, out of stock`;
  const prices = item.variants.map((v) => unitPrice(v, orderType));
  return item.variants.length > 1
    ? `${item.name}, from ${rupees(Math.min(...prices))}`
    : `${item.name}, ${rupees(prices[0]!)}`;
}

/** Category tabs and dish tiles. Each tap saves the dish on the order straight away. */
export function MenuBrowser({ orderId, orderType }: { orderId: string; orderType: OrderType }) {
  const menu = useMenu();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<MenuItem | null>(null);

  const [addError, setAddError] = useState<string | null>(null);
  // Every tap is its own request, so quick repeated taps all count (no tile is locked while
  // an earlier dish is saving). The order refreshes in the background.
  const { add, isPending, saving } = useAddItem(orderId, {
    onStart: () => setAddError(null),
    onAdded: () => setPicking(null),
    onError: (error) => setAddError(describeError(error)),
  });

  if (!menu.data) {
    if (menu.isError) return <ErrorNote message={describeError(menu.error)} />;
    return <p className="text-subtle">Loading menu…</p>;
  }

  const categories = menu.data.categories.filter((c) => c.items.length > 0);
  const active = categories.find((c) => c.id === categoryId) ?? categories[0];
  const query = search.trim().toLowerCase();
  const items = query
    ? categories.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(query))
    : (active?.items ?? []);

  function choose(item: MenuItem) {
    if (item.variants.length > 1 || item.addonGroups.length > 0) setPicking(item);
    else add({ variantId: item.variants[0]!.id, quantity: 1, addonIds: [] });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        aria-label="Search dishes"
        className={inputClass}
        placeholder="Search dishes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {!query && (
        <div
          role="tablist"
          aria-label="Menu categories"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === active?.id}
              onClick={() => setCategoryId(c.id)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                c.id === active?.id
                  ? 'bg-primary-700 text-white shadow-sm'
                  : 'bg-surface text-text ring-1 ring-border-strong hover:bg-surface-2'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <ErrorNote message={addError} />
      <p role="status" className="min-h-5 text-sm text-subtle">
        {saving > 0 ? `Adding ${saving} ${saving === 1 ? 'dish' : 'dishes'}…` : ''}
      </p>
      {picking && (
        <ItemPicker
          item={picking}
          orderType={orderType}
          busy={isPending}
          onAdd={add}
          onClose={() => setPicking(null)}
        />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
        {items.map((item) => {
          const prices = item.variants.map((v) => unitPrice(v, orderType));
          return (
            <button
              key={item.id}
              type="button"
              aria-label={tileLabel(item, orderType)}
              disabled={!item.isAvailable}
              onClick={() => choose(item)}
              className="flex min-h-22 flex-col items-start justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-left shadow-card transition-colors hover:border-primary-300 active:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-start gap-1.5 text-sm font-medium leading-tight">
                <span
                  className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${FOOD_DOT[item.foodType]}`}
                />
                {item.name}
              </span>
              <span className="text-sm font-semibold text-primary-800 tabular-nums">
                {item.isAvailable
                  ? `${item.variants.length > 1 ? 'from ' : ''}${rupees(Math.min(...prices))}`
                  : 'Out of stock'}
              </span>
            </button>
          );
        })}
        {items.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-muted">No dishes match.</p>
        )}
      </div>
    </div>
  );
}
