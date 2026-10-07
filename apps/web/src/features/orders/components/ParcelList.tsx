import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';
import { describeError, ErrorNote, primaryButton } from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
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
  const queryClient = useQueryClient();
  const orders = useActiveOrders();
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>('/api/orders', { method: 'POST', body: { type: 'PARCEL' } }),
    onSuccess: async (order) => {
      onSelect(order.id);
      await queryClient.invalidateQueries({ queryKey: ['orders', 'active'] });
    },
  });
  const parcels = (orders.data ?? []).filter((o) => o.type === 'PARCEL');

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parcels</h2>
        <button
          type="button"
          className={primaryButton}
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          New parcel
        </button>
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
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              p.id === selectedOrderId
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-slate-200 bg-white'
            }`}
          >
            #{p.tokenNo} · {rupees(p.subtotal)}
          </button>
        ))}
        {orders.data && parcels.length === 0 && (
          <p className="text-sm text-slate-500">No parcel orders open.</p>
        )}
      </div>
    </section>
  );
}
