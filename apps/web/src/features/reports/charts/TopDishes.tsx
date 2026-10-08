import { rupees } from '@/shared/lib/money';
import type { SalesReport } from '../types';
import { ChartFrame } from './ChartFrame';

type Item = SalesReport['items'][number];

const dishName = (i: Item) =>
  i.variantName && i.variantName !== 'Regular' ? `${i.itemName} (${i.variantName})` : i.itemName;

/** The eight dishes that earned most, longest bar first. */
export function TopDishes({ items }: { items: Item[] }) {
  const top = items.slice(0, 8);
  if (top.length === 0) return null;
  const max = Math.max(...top.map((i) => i.amount));
  return (
    <ChartFrame
      title="Top dishes"
      takeaway={`Top seller: ${dishName(top[0]!)}, ${rupees(top[0]!.amount)}`}
    >
      <ol className="flex flex-col gap-2">
        {top.map((i) => (
          <li
            key={`${i.itemName}-${i.variantName}`}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate text-text">{dishName(i)}</span>
            <span aria-hidden="true" className="h-2.5 rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-primary-600"
                style={{ width: `${max > 0 ? Math.round((i.amount / max) * 100) : 0}%` }}
              />
            </span>
            <span className="font-medium tabular-nums">{rupees(i.amount)}</span>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}
