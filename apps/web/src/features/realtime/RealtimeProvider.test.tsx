import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { sessionBody } from '@/test/mock-api';
import { useRealtimeEvent } from '@/shared/realtime/context';
import { RealtimeProvider } from './RealtimeProvider';

type Handler = (payload?: unknown) => void;

const sockets: { handlers: Map<string, Handler[]>; options: unknown; disconnect: () => void }[] =
  [];

vi.mock('socket.io-client', () => ({
  io: vi.fn((options: unknown) => {
    const handlers = new Map<string, Handler[]>();
    const socket = {
      handlers,
      options,
      on: (event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return socket;
      },
      disconnect: vi.fn(),
    };
    sockets.push(socket);
    return socket;
  }),
}));

function fire(event: string, payload?: unknown) {
  const socket = sockets[sockets.length - 1]!;
  act(() => {
    for (const handler of socket.handlers.get(event) ?? []) handler(payload);
  });
}

function authOf(index: number): unknown {
  const { auth } = sockets[index]!.options as { auth: (cb: (data: unknown) => void) => void };
  let sent: unknown;
  auth((data) => {
    sent = data;
  });
  return sent;
}

function setup(enabled = true) {
  const client = new QueryClient();
  const spy = vi.spyOn(client, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={client}>
      <RealtimeProvider enabled={enabled}>
        <span>child</span>
      </RealtimeProvider>
    </QueryClientProvider>,
  );
  return { client, spy, utils };
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    sockets.length = 0;
    useSession.getState().setSession(sessionBody('CASHIER', []));
  });

  it('connects at /api/socket.io with the access token', () => {
    setup();
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.options).toMatchObject({ path: '/api/socket.io' });
    expect(authOf(0)).toEqual({ token: 'token-cashier' });
  });

  it('does not connect when disabled', () => {
    setup(false);
    expect(sockets).toHaveLength(0);
  });

  it('refreshes the kitchen and the order when a KOT is created', () => {
    const { spy } = setup();
    fire('kot.created', { orderId: 'o1', kotId: 'k1', stationId: 's1' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['kds'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['order', 'o1'] });
  });

  it('refreshes the floor and active orders when an order changes', () => {
    const { spy } = setup();
    fire('order.updated', { orderId: 'o2', tableId: 't1' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['floor'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['orders', 'active'] });
  });

  it('refreshes bills, the order and the floor when a bill changes', () => {
    const { spy } = setup();
    fire('bill.updated', { billId: 'b1', orderId: 'o1' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['bills', 'o1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['order', 'o1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['floor'] });
  });
  it('refreshes the kitchen screen when an order moves table', () => {
    const { spy } = setup();
    fire('order.updated', { orderId: 'o2', tableId: 't2' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['kds'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['bills', 'o2'] });
  });
  it('refetches everything after reconnecting', () => {
    const { spy } = setup();
    fire('connect');
    expect(spy).not.toHaveBeenCalledWith();
    fire('disconnect');
    fire('connect');
    expect(spy).toHaveBeenCalledWith();
  });

  it('keeps the socket on a token refresh and sends the new token when it reconnects', () => {
    setup();
    act(() => {
      useSession.getState().setSession({ ...sessionBody('CASHIER', []), accessToken: 'token-2' });
    });
    expect(sockets).toHaveLength(1);
    expect(authOf(0)).toEqual({ token: 'token-2' });
  });

  it('reconnects when the user signs out, to leave the staff rooms', () => {
    setup();
    act(() => useSession.getState().clear());
    expect(sockets).toHaveLength(2);
    expect(sockets[0]!.disconnect).toHaveBeenCalled();
    expect(authOf(1)).toEqual({});
  });

  it('lets screens listen to events', () => {
    const seen: unknown[] = [];
    function Listener() {
      useRealtimeEvent('kot.updated', (payload) => seen.push(payload));
      return null;
    }
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <RealtimeProvider enabled>
          <Listener />
        </RealtimeProvider>
      </QueryClientProvider>,
    );
    fire('kot.updated', { kotId: 'k1', status: 'READY' });
    expect(seen).toEqual([{ kotId: 'k1', status: 'READY' }]);
  });
});
