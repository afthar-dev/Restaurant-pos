import { Plus, ShoppingBag } from 'lucide-react';
import { Button, describeError, ErrorNote } from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
import { useOpenParcel } from '../mutations';
import { useActiveOrders } from '../queries';
import { orderLabel } from '../types';

/** Takeaway orders in progress, by token number. */
export function ParcelList({
  selectedOrderId,
  onSelect,
}: {
  selectedOrderId: string | null;
  onSelect: (orderId: string) => void;
}) {
  const orders = useActiveOrders();
  const create = useOpenParcel(onSelect);
  const parcels = (orders.data ?? []).filter((o) => o.type === 'PARCEL');

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
          <ShoppingBag aria-hidden="true" className="size-4" />
          Parcels
        </h2>
        <Button
          size="sm"
          icon={<Plus />}
          loading={create.isPending}
          onClick={() => create.mutate()}
        >
          New parcel
        </Button>
      </div>
      <ErrorNote message={create.isError ? describeError(create.error) : null} />
      <div className="flex flex-wrap gap-2">
        {parcels.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={`${orderLabel(p)}, ${rupees(p.subtotal)}`}
            aria-pressed={p.id === selectedOrderId}
            onClick={() => onSelect(p.id)}
            className={`min-h-11 rounded-lg border-2 px-3 text-sm font-semibold tabular-nums shadow-card ${
              p.id === selectedOrderId
                ? 'border-primary-700 bg-primary-700 text-white'
                : 'border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-400'
            }`}
          >
            #{p.tokenNo} · {rupees(p.subtotal)}
          </button>
        ))}
        {orders.data && parcels.length === 0 && (
          <p className="text-sm text-muted">No parcel orders open.</p>
        )}
      </div>
    </section>
  );
}
