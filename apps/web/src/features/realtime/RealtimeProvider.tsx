import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { RealtimeContext, type Listener, type RealtimeStatus } from '@/shared/realtime/context';
import { useSession } from '@/shared/session/store';
import { INVALIDATIONS } from './invalidations';

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
