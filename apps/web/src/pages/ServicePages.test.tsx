import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../auth/store';
import { line, MENU, order } from '../test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '../test/mock-api';
import { renderRoute } from '../test/render';

type Handler = (payload?: unknown) => void;
const handlers = new Map<string, Handler[]>();

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return socket;
      },
      disconnect: () => undefined,
    };
    return socket;
  },
}));

const DAY = {
  day: { id: 'd1', status: 'OPEN', openingCash: 0, openedAt: '', openedBy: { id: 'm', name: 'M' } },
};

const floor = [
  {
    id: 'a1',
    name: 'AC Hall',
    sortOrder: 0,
    tables: [
      { id: 't1', name: 'T1', seats: 4, order: null },
      {
        id: 't2',
        name: 'T2',
        seats: 2,
        order: {
          orderId: 'o2',
          status: 'OPEN',
          guests: 2,
          itemCount: 1,
          subtotal: 3000,
          openedAt: '',
        },
      },
    ],
  },
];

const running = order({
  id: 'o2',
  table: { id: 't2', name: 'T2' },
  items: [line({ id: 'l1' })],
  subtotal: 3000,
});

function serviceApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/business-day/current': () => json(DAY),
    'GET /api/floor/status': () => json(floor),
    'GET /api/orders': () => json([]),
    'GET /api/orders/o2': () => json(running),
    'GET /api/menu': () => json(MENU),
    'GET /api/devices/current': () => json({ code: 'DEVICE_NOT_REGISTERED' }, 401),
    ...extra,
  });
}

describe('POS counter', () => {
  beforeEach(() => handlers.clear());

  it('opens a running table next to the floor with the menu', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['order.take', 'bill.print']));
    serviceApi();
    renderRoute('/pos');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'POS counter' }),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'T2, 1 item, ₹30' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'T2' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Search dishes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New parcel' })).toBeInTheDocument();
  });
});

describe('Captain app', () => {
  beforeEach(() => handlers.clear());

  function asWaiter() {
    useSession.getState().setSession(sessionBody('WAITER', ['order.take']));
  }

  it('goes from the table grid to the order and back', async () => {
    asWaiter();
    serviceApi();
    renderRoute('/captain');
    fireEvent.click(await screen.findByRole('button', { name: 'T2, 1 item, ₹30' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'T2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'T1, free' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to tables' }));
    expect(await screen.findByRole('button', { name: 'T1, free' })).toBeInTheDocument();
  });

  it('sends the order to the kitchen from the phone', async () => {
    asWaiter();
    const mock = serviceApi({
      'POST /api/orders/o2/kot': () => json({ order: running, kots: [] }, 201),
    });
    renderRoute('/captain');
    fireEvent.click(await screen.findByRole('button', { name: 'T2, 1 item, ₹30' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send to kitchen (1)' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o2/kot').length).toBe(1);
  });

  it('alerts the waiter to a new QR order', async () => {
    useSession.getState().setSession(sessionBody('WAITER', ['order.take', 'order.approveQr']));
    serviceApi({ 'GET /api/qr/pending': () => json([]) });
    renderRoute('/captain');
    await screen.findByRole('button', { name: 'T2, 1 item, ₹30' });
    act(() => {
      for (const h of handlers.get('qr.submitted') ?? [])
        h({ submissionId: 'q1', orderId: 'o1', tableName: 'T1' });
    });
    expect(await screen.findByText('New QR order at T1')).toBeInTheDocument();
  });

  it('tells the waiter when a table’s food is ready', async () => {
    asWaiter();
    serviceApi();
    renderRoute('/captain');
    await screen.findByRole('button', { name: 'T2, 1 item, ₹30' });
    act(() => {
      for (const h of handlers.get('kot.updated') ?? [])
        h({ kotId: 'k1', orderId: 'o2', status: 'READY' });
    });
    expect(await screen.findByText('T2: food is ready to serve')).toBeInTheDocument();
  });

  it('names a parcel or a table it has not loaded from the notice itself', async () => {
    asWaiter();
    serviceApi();
    renderRoute('/captain');
    await screen.findByRole('button', { name: 'T2, 1 item, ₹30' });
    act(() => {
      for (const h of handlers.get('kot.updated') ?? []) {
        h({ kotId: 'k8', orderId: 'o8', status: 'READY', tableName: null, tokenNo: 12 });
        h({ kotId: 'k9', orderId: 'o9', status: 'READY', tableName: 'T9', tokenNo: null });
      }
    });
    expect(await screen.findByText('Parcel #12: ready for pickup')).toBeInTheDocument();
    expect(screen.getByText('T9: food is ready to serve')).toBeInTheDocument();
  });
});
