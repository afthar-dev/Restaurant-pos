import type { OrderType } from '@rpos/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../auth/api';
import { describeError, ErrorNote, inputClass } from '../components/ui';
import { FOOD_DOT, rupees, type MenuItem } from '../pages/admin/menu-types';
import { ItemPicker, unitPrice, type NewLine } from './ItemPicker';
import { useRefreshOrder } from './mutations';
import { useMenu } from './queries';

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
  const refresh = useRefreshOrder();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<MenuItem | null>(null);

  const add = useMutation({
    mutationFn: (line: NewLine) =>
      apiFetch(`/api/orders/${orderId}/items`, { method: 'POST', body: { items: [line] } }),
    onSuccess: async () => {
      setPicking(null);
      await refresh(orderId);
    },
  });

  if (menu.isPending) return <p className="text-slate-500">Loading menu…</p>;
  if (menu.isError) return <ErrorNote message={describeError(menu.error)} />;

  const categories = menu.data.categories.filter((c) => c.items.length > 0);
  const active = categories.find((c) => c.id === categoryId) ?? categories[0];
  const query = search.trim().toLowerCase();
  const items = query
    ? categories.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(query))
    : (active?.items ?? []);

  function choose(item: MenuItem) {
    if (item.variants.length > 1 || item.addonGroups.length > 0) setPicking(item);
    else add.mutate({ variantId: item.variants[0]!.id, quantity: 1, addonIds: [] });
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
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${
                c.id === active?.id
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <ErrorNote message={add.isError ? describeError(add.error) : null} />
      {picking && (
        <ItemPicker
          item={picking}
          orderType={orderType}
          busy={add.isPending}
          onAdd={(line) => add.mutate(line)}
          onClose={() => setPicking(null)}
        />
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
        {items.map((item) => {
          const prices = item.variants.map((v) => unitPrice(v, orderType));
          return (
            <button
              key={item.id}
              type="button"
              aria-label={tileLabel(item, orderType)}
              disabled={!item.isAvailable || add.isPending}
              onClick={() => choose(item)}
              className="flex min-h-20 flex-col items-start justify-between rounded-lg border border-slate-200 bg-white p-2 text-left active:bg-emerald-50 disabled:opacity-50"
            >
              <span className="flex items-start gap-1.5 text-sm font-medium leading-tight">
                <span
                  className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${FOOD_DOT[item.foodType]}`}
                />
                {item.name}
              </span>
              <span className="text-xs text-slate-600 tabular-nums">
                {item.isAvailable
                  ? `${item.variants.length > 1 ? 'from ' : ''}${rupees(Math.min(...prices))}`
                  : 'Out of stock'}
              </span>
            </button>
          );
        })}
        {items.length === 0 && <p className="text-sm text-slate-500">No dishes match.</p>}
      </div>
    </div>
  );
}
