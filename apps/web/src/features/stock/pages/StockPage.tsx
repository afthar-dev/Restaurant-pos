import { formatQuantity } from '@rpos/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { rupees } from '@/shared/lib/money';
import {
  describeError,
  ErrorNote,
  LoadingScreen,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import { AdjustSheet } from '../components/AdjustSheet';
import { CountSheet } from '../components/CountSheet';
import { HistorySheet } from '../components/HistorySheet';
import { StockItemSheet } from '../components/StockItemSheet';
import { useStockItems } from '../queries';
import { quantityLabel, type StockItem } from '../types';

type Open =
  { kind: 'new' } | { kind: 'edit' | 'count' | 'adjust' | 'history'; item: StockItem } | null;

/** The stock register: what is on hand, what is running low, and counts. */
export function StockPage() {
  const items = useStockItems();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const low = (items.data ?? []).filter((i) => i.low);

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Stock</h1>
        <div className="flex gap-2">
          <Link to="/stock/purchases" className={`${secondaryButton} min-h-11 content-center`}>
            Purchases
          </Link>
          <button type="button" className={primaryButton} onClick={() => setOpen({ kind: 'new' })}>
            Add stock item
          </button>
        </div>
      </div>
      {low.length > 0 && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"
        >
          {`${low.length} ${low.length === 1 ? 'item' : 'items'} low on stock: ${low.map((i) => i.name).join(', ')}`}
        </p>
      )}
      {!items.data ? (
        items.isError ? (
          <ErrorNote message={describeError(items.error)} />
        ) : (
          <LoadingScreen />
        )
      ) : items.data.length === 0 ? (
        <p className="text-slate-600">No stock items yet. Add the raw materials you buy.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2 text-right">On hand</th>
                <th className="px-3 py-2 text-right">Alert at</th>
                <th className="px-3 py-2 text-right">Last rate</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.data.map((item) => (
                <tr key={item.id} className={item.low ? 'bg-amber-50' : ''}>
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${item.currentMilli < 0 ? 'font-semibold text-red-700' : ''}`}
                  >
                    {quantityLabel(item.currentMilli, item.unit)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {item.minLevelMilli > 0
                      ? `${formatQuantity(item.minLevelMilli)} ${item.unit}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {item.lastPurchase ? `${rupees(item.lastPurchase.rate)}/${item.unit}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap justify-end gap-1">
                      {(['count', 'adjust', 'history', 'edit'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className={secondaryButton}
                          aria-label={`${kind[0]!.toUpperCase()}${kind.slice(1)} ${item.name}`}
                          onClick={() => setOpen({ kind, item })}
                        >
                          {`${kind[0]!.toUpperCase()}${kind.slice(1)}`}
                        </button>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open?.kind === 'new' && <StockItemSheet existing={null} onClose={close} />}
      {open?.kind === 'edit' && <StockItemSheet existing={open.item} onClose={close} />}
      {open?.kind === 'count' && <CountSheet item={open.item} onClose={close} />}
      {open?.kind === 'adjust' && <AdjustSheet item={open.item} onClose={close} />}
      {open?.kind === 'history' && <HistorySheet item={open.item} onClose={close} />}
    </section>
  );
}
