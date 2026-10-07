import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/shared/api/http';
import { describeError, ErrorNote, secondaryButton, Sheet } from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
import { useFloorStatus } from '../queries';
import type { FloorTableStatus } from '../types';

const GUEST_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1);

function tileLabel(table: FloorTableStatus): string {
  if (!table.order) return `${table.name}, free`;
  if (table.order.status === 'PENDING_APPROVAL') return `${table.name}, QR order waiting`;
  if (table.order.mergedInto) return `${table.name}, with ${table.order.mergedInto}`;
  const items = table.order.itemCount === 1 ? '1 item' : `${table.order.itemCount} items`;
  return `${table.name}, ${items}, ${rupees(table.order.subtotal)}`;
}

/** Tables by area. Tap a free table to seat guests; tap a running one to open its order. */
export function FloorGrid({
  selectedOrderId,
  onSelect,
}: {
  selectedOrderId: string | null;
  onSelect: (orderId: string) => void;
}) {
  const queryClient = useQueryClient();
  const floor = useFloorStatus();
  const [seating, setSeating] = useState<FloorTableStatus | null>(null);

  const open = useMutation({
    mutationFn: ({ tableId, guests }: { tableId: string; guests: number }) =>
      apiFetch<{ id: string }>('/api/orders', {
        method: 'POST',
        body: { type: 'DINE_IN', tableId, guests },
      }),
    onSuccess: async (order) => {
      setSeating(null);
      onSelect(order.id);
      await queryClient.invalidateQueries({ queryKey: ['floor'] });
    },
  });

  if (!floor.data) {
    if (floor.isError) return <ErrorNote message={describeError(floor.error)} />;
    return <p className="text-slate-500">Loading tables…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {seating && (
        <Sheet label={`Guests at ${seating.name}`} onClose={() => setSeating(null)}>
          <p className="font-medium">How many guests at {seating.name}?</p>
          <div className="grid grid-cols-6 gap-2">
            {GUEST_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} guests`}
                disabled={open.isPending}
                className="h-12 rounded-md border border-slate-300 bg-white text-lg font-semibold active:bg-emerald-50"
                onClick={() => open.mutate({ tableId: seating.id, guests: n })}
              >
                {n}
              </button>
            ))}
          </div>
          <ErrorNote message={open.isError ? describeError(open.error) : null} />
          <button
            type="button"
            className={`${secondaryButton} self-start`}
            onClick={() => setSeating(null)}
          >
            Cancel
          </button>
        </Sheet>
      )}
      {floor.data.map((area) => (
        <section key={area.id} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {area.name}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
            {area.tables.map((table) => {
              const running = Boolean(table.order);
              const selected = table.order?.orderId === selectedOrderId && running;
              return (
                <button
                  key={table.id}
                  type="button"
                  aria-label={tileLabel(table)}
                  aria-pressed={selected}
                  onClick={() => (table.order ? onSelect(table.order.orderId) : setSeating(table))}
                  className={`flex h-20 flex-col items-start justify-between rounded-lg border p-2 text-left ${
                    selected
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : running
                        ? 'border-amber-300 bg-amber-50 text-amber-950'
                        : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <span className="text-lg font-semibold">{table.name}</span>
                  {table.order ? (
                    <span className="text-xs tabular-nums">
                      {table.order.mergedInto
                        ? `with ${table.order.mergedInto}`
                        : `${table.order.itemCount} · ${rupees(table.order.subtotal)}`}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">{table.seats} seats</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {floor.data.length === 0 && (
        <p className="text-sm text-slate-500">
          No tables yet. An owner can add them in Admin → Tables.
        </p>
      )}
    </div>
  );
}
