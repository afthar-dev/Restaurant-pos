import { BellRing, CircleDot, Link2, ReceiptText, Users, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useCan } from '@/shared/session/store';
import { cn } from '@/shared/lib/cn';
import { rupees } from '@/shared/lib/money';
import {
  Button,
  describeError,
  Dialog,
  EmptyState,
  ErrorNote,
  LoadingScreen,
  secondaryButton,
} from '@/shared/ui';
import { useOpenTable } from '../mutations';
import { useFloorStatus } from '../queries';
import type { FloorTableStatus } from '../types';

const GUEST_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1);

function tileLabel(table: FloorTableStatus): string {
  if (!table.order) return `${table.name}, free`;
  if (table.order.status === 'PENDING_APPROVAL') return `${table.name}, QR order waiting`;
  if (table.order.mergedInto) return `${table.name}, with ${table.order.mergedInto}`;
  if (table.order.status === 'BILLED') {
    return `${table.name}, bill printed, ${rupees(table.order.subtotal)}`;
  }
  const items = table.order.itemCount === 1 ? '1 item' : `${table.order.itemCount} items`;
  return `${table.name}, ${items}, ${rupees(table.order.subtotal)}`;
}

type TileState = 'free' | 'running' | 'billed' | 'qr' | 'merged';

function tileState(table: FloorTableStatus): TileState {
  const order = table.order;
  if (!order) return 'free';
  if (order.mergedInto) return 'merged';
  if (order.status === 'PENDING_APPROVAL') return 'qr';
  if (order.status === 'BILLED') return 'billed';
  return 'running';
}

/** Colour, icon and word for each table state: never colour alone. */
const TILE: Record<TileState, { className: string; icon: typeof CircleDot; word: string }> = {
  free: {
    className: 'border-green-200 bg-surface hover:border-green-400',
    icon: CircleDot,
    word: 'Free',
  },
  running: {
    className: 'border-amber-300 bg-amber-50 hover:border-amber-400',
    icon: UtensilsCrossed,
    word: 'Running',
  },
  billed: {
    className: 'border-sky-300 bg-sky-50 hover:border-sky-400',
    icon: ReceiptText,
    word: 'Bill printed',
  },
  qr: {
    className: 'border-violet-300 bg-violet-50 hover:border-violet-400',
    icon: BellRing,
    word: 'QR waiting',
  },
  merged: {
    className: 'border-border-strong bg-surface-2 hover:border-slate-400',
    icon: Link2,
    word: 'Merged',
  },
};

const STATE_TEXT: Record<TileState, string> = {
  free: 'text-green-800',
  running: 'text-amber-900',
  billed: 'text-sky-800',
  qr: 'text-violet-800',
  merged: 'text-muted',
};

/** Tables by area. Tap a free table to seat guests; tap a running one to open its order. */
export function FloorGrid({
  selectedOrderId,
  onSelect,
}: {
  selectedOrderId: string | null;
  onSelect: (orderId: string) => void;
}) {
  const floor = useFloorStatus();
  const canSetUp = useCan('settings.manage');
  const [seating, setSeating] = useState<FloorTableStatus | null>(null);

  const open = useOpenTable((orderId) => {
    setSeating(null);
    onSelect(orderId);
  });

  if (!floor.data) {
    if (floor.isError) {
      return (
        <ErrorNote message={describeError(floor.error)} onRetry={() => void floor.refetch()} />
      );
    }
    return <LoadingScreen rows={2} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {seating && (
        <Dialog label={`Guests at ${seating.name}`} onClose={() => setSeating(null)}>
          <div className="flex flex-col gap-1 pr-8">
            <h2 className="text-lg font-semibold">How many guests at {seating.name}?</h2>
            <p className="text-sm text-muted">The table seats {seating.seats}.</p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {GUEST_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} guests`}
                disabled={open.isPending}
                className="h-14 rounded-lg border border-border-strong bg-surface text-xl font-semibold tabular-nums hover:border-primary-600 hover:bg-primary-50 active:bg-primary-100 disabled:opacity-50"
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
        </Dialog>
      )}
      {floor.data.map((area) => (
        <section key={area.id} className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{area.name}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
            {area.tables.map((table) => {
              const state = tileState(table);
              const { className, icon: Icon, word } = TILE[state];
              const selected = Boolean(table.order) && table.order?.orderId === selectedOrderId;
              return (
                <button
                  key={table.id}
                  type="button"
                  aria-label={tileLabel(table)}
                  aria-pressed={selected}
                  onClick={() => (table.order ? onSelect(table.order.orderId) : setSeating(table))}
                  className={cn(
                    'flex min-h-24 flex-col items-start justify-between gap-1 rounded-lg border-2 p-2.5 text-left shadow-card transition-colors',
                    selected ? 'border-primary-700 bg-primary-700 text-white' : className,
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className="text-lg leading-tight font-semibold">{table.name}</span>
                    {table.order?.guests ? (
                      <span
                        className={cn(
                          'flex items-center gap-0.5 text-xs tabular-nums',
                          selected ? 'text-white/85' : 'text-muted',
                        )}
                      >
                        <Users aria-hidden="true" className="size-4" />
                        {table.order.guests}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'flex items-center gap-1 text-xs font-medium',
                      selected ? 'text-white' : STATE_TEXT[state],
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {word}
                  </span>
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      selected ? 'text-white/85' : 'text-muted',
                    )}
                  >
                    {table.order
                      ? table.order.mergedInto
                        ? `with ${table.order.mergedInto}`
                        : `${table.order.itemCount} · ${rupees(table.order.subtotal)}`
                      : `${table.seats} seats`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {floor.data.length === 0 && (
        <EmptyState
          icon={<UtensilsCrossed />}
          title="No tables yet"
          description="An owner adds the dining areas and tables in Admin → Tables."
          action={
            canSetUp && (
              <Button asChild variant="secondary" size="sm">
                <Link to="/admin/tables">Set up tables</Link>
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
