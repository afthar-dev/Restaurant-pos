import { ChevronRight, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Cart, cartTotals, useCart, type CartLine } from '@/features/cart';
import { ItemSheet, Menu, MenuSkeleton, useMenu, type MenuItem } from '@/features/menu';
import { Requests, useMyRequests, useSubmitOrder } from '@/features/requests';
import type { StoredSession } from '@/features/session';
import { isSessionEnded, QrApiError } from '@/shared/api/http';
import { rupees } from '@/shared/lib/money';
import { button } from '@/shared/ui';
import { shell } from './shell';

const itemsLabel = (n: number) => (n === 1 ? '1 item' : `${n} items`);

/** The table's menu, the cart and what this phone has already sent. */
export function Ordering({ session }: { session: StoredSession }) {
  const menu = useMenu(session.token);
  const requests = useMyRequests(session.token);
  const submit = useSubmitOrder(session.token);
  const lines = useCart((s) => s.lines);
  const addLine = useCart((s) => s.add);
  const setQuantity = useCart((s) => s.setQuantity);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // A session that ended shows its own screen; any other failure offers a retry.
  const problem =
    menu.isError && !menu.isFetching && !isSessionEnded(menu.error) ? menu.error.message : null;
  const sendError = submit.isError
    ? submit.error instanceof QrApiError
      ? submit.error.message
      : 'Could not send. Please try again.'
    : null;
  const { dishes, total } = cartTotals(lines);

  function add(line: CartLine) {
    addLine(line);
    setPicking(null);
  }

  function send(note: string) {
    if (submit.isPending) return;
    submit.mutate(note, { onSuccess: () => setCartOpen(false) });
  }

  return (
    <main className={shell}>
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-700 text-white"
        >
          <UtensilsCrossed className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted">{session.outlet}</p>
          <h1 className="text-2xl font-bold tracking-tight">Table {session.table}</h1>
          <p className="text-xs text-muted">Dine-in · order here, the staff confirm it</p>
        </div>
      </header>
      <Requests requests={requests.data ?? []} />
      {problem && (
        <div className="flex flex-col gap-2 rounded-xl bg-red-50 px-3 py-2 text-red-800">
          <p>{problem}</p>
          <button
            type="button"
            className={`${button} border border-red-300 bg-surface`}
            onClick={() => void menu.refetch()}
          >
            Try again
          </button>
        </div>
      )}
      {menu.data ? (
        <Menu menu={menu.data} onPick={setPicking} onOpenCart={() => setCartOpen(true)} />
      ) : (
        !problem && <MenuSkeleton />
      )}
      {picking && <ItemSheet item={picking} onAdd={add} onClose={() => setPicking(null)} />}
      {dishes > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md p-3">
          <button
            type="button"
            aria-label={`View order, ${itemsLabel(dishes)}, ${rupees(total)}`}
            className="flex min-h-14 w-full items-center justify-between rounded-xl bg-primary-700 px-4 text-white shadow-overlay"
            onClick={() => setCartOpen(true)}
          >
            <span className="flex flex-col items-start leading-tight">
              <span className="text-xs font-medium uppercase tracking-wide opacity-90">
                {itemsLabel(dishes)}
              </span>
              <span className="text-base font-bold tabular-nums">{rupees(total)}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-base font-semibold">
              View order
              <ChevronRight aria-hidden="true" className="size-5" />
            </span>
          </button>
        </div>
      )}
      {cartOpen && (
        <Cart
          lines={lines}
          busy={submit.isPending}
          error={sendError}
          onQuantity={setQuantity}
          onSend={send}
          onClose={() => setCartOpen(false)}
        />
      )}
    </main>
  );
}
