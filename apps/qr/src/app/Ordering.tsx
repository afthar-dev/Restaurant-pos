import { useState } from 'react';
import { Cart, cartTotals, useCart, type CartLine } from '@/features/cart';
import { ItemSheet, Menu, useMenu, type MenuItem } from '@/features/menu';
import { Requests, useMyRequests, useSubmitOrder } from '@/features/requests';
import type { StoredSession } from '@/features/session';
import { isSessionEnded, QrApiError } from '@/shared/api/http';
import { rupees } from '@/shared/lib/money';
import { button } from '@/shared/ui';
import { shell } from './shell';

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
      <header>
        <p className="text-sm text-muted">{session.outlet}</p>
        <h1 className="text-2xl font-semibold">Table {session.table}</h1>
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
        <Menu menu={menu.data} onPick={setPicking} />
      ) : (
        !problem && <p>Loading the menu…</p>
      )}
      {picking && <ItemSheet item={picking} onAdd={add} onClose={() => setPicking(null)} />}
      {dishes > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md p-3">
          <button
            type="button"
            className={`${button} w-full bg-primary-700 text-white shadow-lg`}
            onClick={() => setCartOpen(true)}
          >
            {`Your order · ${dishes} ${dishes === 1 ? 'dish' : 'dishes'} · ${rupees(total)} approx.`}
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
