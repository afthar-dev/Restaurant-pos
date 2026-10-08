import { useState, type ReactNode } from 'react';
import { rupees } from '@/shared/lib/money';
import { inputClass } from '@/shared/ui';
import { dateLabel } from '../ranges';
import type { SalesReport } from '../types';

const th = 'px-3 py-2';
const num = 'px-3 py-2 text-right tabular-nums';

function Table({ label, head, children }: { label: string; head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
      <table aria-label={label} className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i === 0 ? th : `${th} text-right`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

/** One row per business day in the range. */
export function DaysTable({ days }: { days: SalesReport['days'] }) {
  return (
    <Table label="Days" head={['Date', 'Bills', 'Sales', 'Cash', 'UPI', 'Card', 'Expenses']}>
      {days.map((d) => (
        <tr key={d.dayId}>
          <td className={th}>
            {dateLabel(d.date)}
            {d.status === 'OPEN' && <span className="ml-1 text-xs text-amber-800">(open)</span>}
          </td>
          <td className={num}>{d.bills}</td>
          <td className={num}>{rupees(d.total)}</td>
          <td className={num}>{rupees(d.cash)}</td>
          <td className={num}>{rupees(d.upi)}</td>
          <td className={num}>{rupees(d.card)}</td>
          <td className={num}>{rupees(d.expenses)}</td>
        </tr>
      ))}
    </Table>
  );
}

const dishName = (i: { itemName: string; variantName: string }) =>
  i.variantName === 'Regular' ? i.itemName : `${i.itemName} (${i.variantName})`;

/** Every dish sold, with a search box. */
export function ItemsTable({ items }: { items: SalesReport['items'] }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const shown = query ? items.filter((i) => dishName(i).toLowerCase().includes(query)) : items;
  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label="Search dishes"
        placeholder="Search dishes"
        className={inputClass}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Table label="Dishes sold" head={['Dish', 'Quantity', 'Amount']}>
        {shown.map((i) => (
          <tr key={`${i.itemName}|${i.variantName}`}>
            <td className={th}>{dishName(i)}</td>
            <td className={num}>{i.quantity}</td>
            <td className={num}>{rupees(i.amount)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

export function CategoriesTable({ categories }: { categories: SalesReport['categories'] }) {
  return (
    <Table label="Categories" head={['Category', 'Quantity', 'Amount']}>
      {categories.map((c) => (
        <tr key={c.name}>
          <td className={th}>{c.name}</td>
          <td className={num}>{c.quantity}</td>
          <td className={num}>{rupees(c.amount)}</td>
        </tr>
      ))}
    </Table>
  );
}
