import { createContext, useContext, useEffect, useRef } from 'react';

export type RealtimeStatus = 'off' | 'connecting' | 'connected' | 'disconnected';

export type Listener = (payload: unknown) => void;

export interface RealtimeContextValue {
  status: RealtimeStatus;
  subscribe: (event: string, listener: Listener) => () => void;
}

export const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'off',
  subscribe: () => () => undefined,
});

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
