import { useCallback, useEffect, useRef, useState } from 'react';
import { isSessionEnded, qrFetch, QrApiError } from './api';
import { Cart } from './Cart';
import { button, ItemSheet } from './ItemSheet';
import { Menu } from './Menu';
import { rupees } from './money';
import { Requests } from './Requests';
import { forgetSession, loadSession, saveSession, type StoredSession } from './session';
import type { CartLine, Menu as MenuData, MenuItem, Request } from './types';

/** While anything waits for staff, check for their decision this often. */
const STATUS_POLL_MS = 5_000;

function readTableToken(search: string): string | null {
  const token = new URLSearchParams(search).get('t')?.trim();
  return token ? token : null;
}

const shell =
  'mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-white px-4 pb-28 pt-6 text-slate-900';

type Stage =
  | { kind: 'starting' }
  | { kind: 'ready'; session: StoredSession }
  | { kind: 'problem'; message: string; retry: boolean }
  | { kind: 'ended' };

async function startSession(code: string): Promise<StoredSession> {
  const started = await qrFetch<{
    token: string;
    table: { name: string };
    outlet: { name: string };
  }>('/api/qr/sessions', { method: 'POST', body: { code } });
  const session = { token: started.token, table: started.table.name, outlet: started.outlet.name };
  saveSession(code, session);
  return session;
}

export function App({ search }: { search: string }) {
  const code = readTableToken(search);
  const [stage, setStage] = useState<Stage>({ kind: 'starting' });

  const begin = useCallback(
    async (fresh: boolean) => {
      if (!code) return;
      const stored = fresh ? null : loadSession(code);
      if (stored) return setStage({ kind: 'ready', session: stored });
      setStage({ kind: 'starting' });
      try {
        setStage({ kind: 'ready', session: await startSession(code) });
      } catch (error) {
        setStage({
          kind: 'problem',
          message: error instanceof Error ? error.message : 'Please call the waiter.',
          // An unknown sticker will not start working by trying again.
          retry: !(error instanceof QrApiError && error.code === 'QR_UNKNOWN'),
        });
      }
    },
    [code],
  );

  useEffect(() => {
    void begin(false);
  }, [begin]);

  if (!code) {
    return (
      <main className={shell}>
        <h1 className="text-2xl font-semibold">Scan to order</h1>
        <p className="text-slate-600">Scan the QR code on your table to see the menu.</p>
      </main>
    );
  }
  if (stage.kind === 'starting') {
    return (
      <main className={shell}>
        <p className="text-slate-600">Opening the menu…</p>
      </main>
    );
  }
  if (stage.kind === 'problem') {
    return (
      <main className={shell}>
        <h1 className="text-2xl font-semibold">Sorry</h1>
        <p className="text-slate-700">{stage.message}</p>
        {stage.retry && (
          <button
            type="button"
            className={`${button} bg-emerald-700 text-white`}
            onClick={() => void begin(false)}
          >
            Try again
          </button>
        )}
      </main>
    );
  }
  if (stage.kind === 'ended') {
    return (
      <main className={shell}>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-slate-700">Your table was closed. Scan the table QR again.</p>
        <button
          type="button"
          className={`${button} bg-emerald-700 text-white`}
          onClick={() => void begin(true)}
        >
          Start again
        </button>
      </main>
    );
  }
  return (
    <Ordering
      session={stage.session}
      onEnded={() => {
        forgetSession(code);
        setStage({ kind: 'ended' });
      }}
    />
  );
}

function Ordering({ session, onEnded }: { session: StoredSession; onEnded: () => void }) {
  const [menu, setMenu] = useState<MenuData | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One id per cart, kept after a failure so a retry cannot send the order twice.
  const requestId = useRef<string | null>(null);
  const ended = useRef(onEnded);
  ended.current = onEnded;

  const call = useCallback(
    async <T,>(path: string, options: Parameters<typeof qrFetch>[1] = {}): Promise<T> => {
      try {
        return await qrFetch<T>(path, { ...options, token: session.token });
      } catch (error) {
        if (isSessionEnded(error)) ended.current();
        throw error;
      }
    },
    [session.token],
  );

  const loadMenu = useCallback(() => {
    setProblem(null);
    call<MenuData>('/api/qr/menu').then(setMenu, (error: unknown) => {
      if (!isSessionEnded(error)) setProblem((error as Error).message);
    });
  }, [call]);

  const loadRequests = useCallback(() => {
    call<Request[]>('/api/qr/orders').then(setRequests, () => undefined);
  }, [call]);

  useEffect(() => {
    loadMenu();
    loadRequests();
  }, [loadMenu, loadRequests]);

  /** Any change to the cart makes it a different order, so it needs a new request id. */
  function cartChanged() {
    requestId.current = null;
  }

  const waiting = requests.some((r) => r.status === 'PENDING');
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      call<Request[]>('/api/qr/orders').then(setRequests, () => undefined);
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, call]);

  function addToCart(line: CartLine) {
    cartChanged();
    setCart((current) => {
      const same = current.find((l) => l.key === line.key);
      if (!same) return [...current, line];
      return current.map((l) =>
        l.key === line.key ? { ...l, quantity: Math.min(20, l.quantity + line.quantity) } : l,
      );
    });
    setPicking(null);
  }

  async function send(note: string) {
    if (busy) return;
    setBusy(true);
    setSendError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      const sent = await call<Request>('/api/qr/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': requestId.current },
        body: {
          lines: cart.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            addonIds: l.addonIds,
            ...(l.note ? { note: l.note } : {}),
          })),
          ...(note ? { note } : {}),
        },
      });
      requestId.current = null;
      setCart([]);
      setCartOpen(false);
      setRequests((current) => [sent, ...current.filter((r) => r.id !== sent.id)]);
    } catch (error) {
      setSendError(
        error instanceof QrApiError ? error.message : 'Could not send. Please try again.',
      );
      // The order may have reached the staff even though the reply was lost: show it if so.
      loadRequests();
    } finally {
      setBusy(false);
    }
  }

  const dishes = cart.reduce((n, l) => n + l.quantity, 0);
  const total = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  return (
    <main className={shell}>
      <header>
        <p className="text-sm text-slate-500">{session.outlet}</p>
        <h1 className="text-2xl font-semibold">Table {session.table}</h1>
      </header>
      <Requests requests={requests} />
      {problem && (
        <div className="flex flex-col gap-2 rounded-xl bg-red-50 px-3 py-2 text-red-800">
          <p>{problem}</p>
          <button
            type="button"
            className={`${button} border border-red-300 bg-white`}
            onClick={loadMenu}
          >
            Try again
          </button>
        </div>
      )}
      {menu ? <Menu menu={menu} onPick={setPicking} /> : !problem && <p>Loading the menu…</p>}
      {picking && <ItemSheet item={picking} onAdd={addToCart} onClose={() => setPicking(null)} />}
      {dishes > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md p-3">
          <button
            type="button"
            className={`${button} w-full bg-emerald-700 text-white shadow-lg`}
            onClick={() => setCartOpen(true)}
          >
            {`Your order · ${dishes} ${dishes === 1 ? 'dish' : 'dishes'} · ${rupees(total)} approx.`}
          </button>
        </div>
      )}
      {cartOpen && (
        <Cart
          lines={cart}
          busy={busy}
          error={sendError}
          onQuantity={(key, quantity) => {
            cartChanged();
            setCart((current) =>
              quantity <= 0
                ? current.filter((l) => l.key !== key)
                : current.map((l) => (l.key === key ? { ...l, quantity } : l)),
            );
          }}
          onSend={(note) => void send(note)}
          onClose={() => setCartOpen(false)}
        />
      )}
    </main>
  );
}
