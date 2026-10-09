import type { ReactNode } from 'react';
import { rupees } from '@/shared/lib/money';
import { FoodMark } from '@/shared/ui';
import type { MenuItem } from '../types';

/** One dish in Admin → Menu: name, badges, sizes and prices, and its actions on the right. */
export function ItemRow({ item, actions }: { item: MenuItem; actions: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="size-10 shrink-0 rounded-md object-cover"
            />
          )}
          <FoodMark type={item.foodType} />
          {item.name}
          {item.isCombo && <span className="text-xs text-subtle">combo</span>}
          {!item.isAvailable && (
            <span className="rounded bg-amber-50 px-1.5 text-xs text-amber-800">out of stock</span>
          )}
        </span>
        <span className="text-sm text-muted">
          {item.variants.map((v) => `${v.name} ${rupees(v.dineInPrice)}`).join(' · ')}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
