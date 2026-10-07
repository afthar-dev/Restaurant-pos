import { useState } from 'react';
import { useCan } from '@/shared/session/store';
import { describeError, ErrorNote, secondaryButton, Sheet } from '@/shared/ui';
import { useTableChange } from '../mutations';
import { useFloorStatus } from '../queries';
import { orderLabel, type FloorTableStatus, type Order } from '../types';

type Mode = 'move' | 'merge';

/** Move the party to another table, or bring another table's order into this one (§5.4). */
export function TableActions({ order }: { order: Order }) {
  const canManage = useCan('table.manage');
  const [mode, setMode] = useState<Mode | null>(null);
  if (!canManage || order.type !== 'DINE_IN') return null;
  const canMove = order.status === 'OPEN' || order.status === 'BILLED';
  const canMerge = order.status === 'OPEN';
  if (!canMove) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`${secondaryButton} min-h-11`}
        onClick={() => setMode('move')}
      >
        Move table
      </button>
      {canMerge && (
        <button
          type="button"
          className={`${secondaryButton} min-h-11`}
          onClick={() => setMode('merge')}
        >
          Merge table
        </button>
      )}
      {mode && <TableSheet order={order} mode={mode} onDone={() => setMode(null)} />}
    </div>
  );
}

function TableSheet({ order, mode, onDone }: { order: Order; mode: Mode; onDone: () => void }) {
  const floor = useFloorStatus();
  const act = useTableChange(order, mode, onDone);

  const fits = (t: FloorTableStatus) =>
    mode === 'move'
      ? t.order === null
      : t.order !== null &&
        t.order.status === 'OPEN' &&
        t.order.orderId !== order.id &&
        !t.order.mergedInto;
  const label =
    mode === 'move' ? `Move ${orderLabel(order)} to` : `Merge into ${orderLabel(order)}`;
  const areas = (floor.data ?? [])
    .map((a) => ({ ...a, tables: a.tables.filter(fits) }))
    .filter((a) => a.tables.length > 0);

  return (
    <Sheet label={label} onClose={onDone}>
      <h3 className="text-lg font-semibold">{label}</h3>
      {mode === 'merge' && (
        <p className="text-sm text-slate-600">
          The other table&apos;s dishes join this order; both tables stay taken until the bill is
          paid.
        </p>
      )}
      {floor.data && areas.length === 0 && (
        <p className="text-sm text-slate-600">
          {mode === 'move' ? 'No free tables right now.' : 'No other running tables.'}
        </p>
      )}
      {areas.map((area) => (
        <section key={area.id} className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {area.name}
          </h4>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
            {area.tables.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-label={
                  mode === 'move' ? `Move to ${t.name}` : `Merge ${t.name} into this order`
                }
                disabled={act.isPending}
                className="h-14 rounded-lg border border-slate-300 bg-white text-lg font-semibold active:bg-primary-50"
                onClick={() => act.mutate(t)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </section>
      ))}
      <ErrorNote message={act.isError ? describeError(act.error) : null} />
      <button type="button" className={`${secondaryButton} min-h-11 self-start`} onClick={onDone}>
        Close
      </button>
    </Sheet>
  );
}
