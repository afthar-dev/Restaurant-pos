import { formatQuantity } from '@rpos/shared';
import { rupees } from '@/shared/lib/money';
import { describeError, ErrorNote, secondaryButton, Sheet } from '@/shared/ui';
import { useStockTxns } from '../queries';
import { TXN_LABEL, type StockItem } from '../types';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** The latest changes to one item's stock. */
export function HistorySheet({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const txns = useStockTxns(item.id);
  return (
    <Sheet label={`History of ${item.name}`} onClose={onClose}>
      <h3 className="text-lg font-semibold">History of {item.name}</h3>
      <ErrorNote message={txns.isError ? describeError(txns.error) : null} />
      {txns.data?.length === 0 && <p className="text-sm text-slate-500">No changes yet.</p>}
      <ul className="flex flex-col divide-y divide-slate-100 text-sm">
        {txns.data?.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 py-2">
            <span className="flex flex-col">
              <span className="font-medium">
                {TXN_LABEL[t.type]}
                {t.note ? ` · ${t.note}` : ''}
              </span>
              <span className="text-xs text-slate-500">{`${when(t.createdAt)} · ${t.createdBy.name}`}</span>
            </span>
            <span className="text-right tabular-nums">
              <span className={t.qtyMilli < 0 ? 'text-red-700' : 'text-green-800'}>
                {`${t.qtyMilli > 0 ? '+' : ''}${formatQuantity(t.qtyMilli)} ${item.unit}`}
              </span>
              {t.amount !== null && (
                <span className="block text-xs text-slate-500">{rupees(Math.abs(t.amount))}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className={secondaryButton} onClick={onClose}>
        Close
      </button>
    </Sheet>
  );
}
