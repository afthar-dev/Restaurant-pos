import { rupees } from '@/shared/lib/money';
import { describeError, ErrorNote, secondaryButton } from '@/shared/ui';
import { useSetLineQuantity } from '../../mutations';
import type { Order, OrderLine } from '../../types';
import { lineDetail } from './lineDetail';

/** A dish not yet sent to the kitchen, with − / + to change how many. */
export function NewLineRow({ order, line }: { order: Order; line: OrderLine }) {
  const change = useSetLineQuantity(order, line);
  const detail = lineDetail(line);
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{line.itemName}</span>
          {detail && <span className="text-xs text-subtle">{detail}</span>}
          {line.note && <span className="text-xs italic text-subtle">“{line.note}”</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`One less ${line.itemName}`}
            className={`${secondaryButton} h-9 w-9`}
            disabled={change.isPending}
            onClick={() => change.mutate(line.quantity - 1)}
          >
            −
          </button>
          <span className="w-6 text-center tabular-nums">{line.quantity}</span>
          <button
            type="button"
            aria-label={`One more ${line.itemName}`}
            className={`${secondaryButton} h-9 w-9`}
            disabled={change.isPending || line.quantity >= 99}
            onClick={() => change.mutate(line.quantity + 1)}
          >
            +
          </button>
          <span className="w-16 text-right text-sm tabular-nums">{rupees(line.lineTotal)}</span>
        </div>
      </div>
      <ErrorNote message={change.isError ? describeError(change.error) : null} />
    </li>
  );
}
