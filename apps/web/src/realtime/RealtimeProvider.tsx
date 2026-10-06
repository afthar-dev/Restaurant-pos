import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io } from 'socket.io-client';
import { useSession } from '../auth/store';

export type RealtimeStatus = 'off' | 'connecting' | 'connected' | 'disconnected';

type Listener = (payload: unknown) => void;

interface RealtimeContextValue {
  status: RealtimeStatus;
  subscribe: (event: string, listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'off',
  subscribe: () => () => undefined,
});

/** What each server notice makes stale. Payloads carry ids only; data is refetched. */
const INVALIDATIONS: Record<string, (payload: Record<string, unknown>) => QueryKey[]> = {
  'order.updated': (p) => [
    ['order', p.orderId],
    ['bills', p.orderId],
    ['floor'],
    ['orders', 'active'],
    // A moved order shows its new table on the kitchen screen.
    ['kds'],
  ],
  'bill.updated': (p) => [
    ['bills', p.orderId],
    ['order', p.orderId],
    ['orders', 'active'],
    ['floor'],
  ],
  'kot.created': (p) => [['kds'], ['order', p.orderId]],
  'kot.updated': (p) => [['kds'], ['order', p.orderId]],
  'menu.availability': () => [['menu']],
  'day.updated': () => [['business-day']],
  'print.job': () => [['print-jobs']],
};

function invalidate(client: QueryClient, keys: QueryKey[]) {
  for (const queryKey of keys) void client.invalidateQueries({ queryKey });
}

/**
 * One Socket.IO connection for the whole app at /api/socket.io (the device cookie only travels
 * under /api). Signed-in screens also send their access token. After any reconnect every query
 * is refetched, so nothing missed while offline stays stale.
 */
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const client = useQueryClient();
  // Signing in or out changes which rooms this screen belongs to; a token refresh does not.
  const signedIn = useSession((s) => Boolean(s.accessToken));
  const [status, setStatus] = useState<RealtimeStatus>('off');
  const listeners = useRef(new Map<string, Set<Listener>>());
  const everConnected = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    setStatus('connecting');
    const socket = io({
      path: '/api/socket.io',
      // Read at every (re)connect, so a token refreshed since the last attempt is used and a
      // refresh does not need a new socket.
      auth: (cb) => {
        const current = useSession.getState().accessToken;
        cb(current ? { token: current } : {});
      },
      withCredentials: true,
    });
    socket.on('connect', () => {
      if (everConnected.current) void client.invalidateQueries();
      everConnected.current = true;
      setStatus('connected');
    });
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('disconnected'));
    for (const [event, keys] of Object.entries(INVALIDATIONS)) {
      socket.on(event, (payload: unknown) => {
        invalidate(client, keys((payload ?? {}) as Record<string, unknown>));
        for (const listener of listeners.current.get(event) ?? []) listener(payload);
      });
    }
    return () => {
      socket.disconnect();
    };
  }, [enabled, signedIn, client]);

  const subscribe = useCallback((event: string, listener: Listener) => {
    const set = listeners.current.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.current.set(event, set);
    return () => {
      set.delete(listener);
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ status, subscribe }}>{children}</RealtimeContext.Provider>
  );
}

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext).status;
}

/** Runs `handler` for each server notice of this kind (in addition to the query refresh). */
export function useRealtimeEvent(event: string, handler: Listener): void {
  const { subscribe } = useContext(RealtimeContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => subscribe(event, (payload) => latest.current(payload)), [event, subscribe]);
}
