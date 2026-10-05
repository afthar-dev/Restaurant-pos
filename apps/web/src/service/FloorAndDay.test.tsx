import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '../auth/store';
import { callsTo, json, mockApi, sessionBody } from '../test/mock-api';
import { renderWithProviders } from '../test/render';
import { DayGate } from './DayGate';
import { FloorGrid } from './FloorGrid';
import { ParcelList } from './ParcelList';

const T1 = '00000000-0000-4000-8000-0000000000f1';
const floor = [
  {
    id: 'a1',
    name: 'AC Hall',
    sortOrder: 0,
    tables: [
      { id: T1, name: 'T1', seats: 4, order: null },
      {
        id: 't2',
        name: 'T2',
        seats: 2,
        order: {
          orderId: 'o2',
          status: 'OPEN',
          guests: 2,
          itemCount: 2,
          subtotal: 6000,
          openedAt: '2026-10-06T10:00:00Z',
        },
      },
    ],
  },
];

function body(mock: ReturnType<typeof mockApi>, method: string, path: string) {
  const [call] = callsTo(mock, method, path);
  return JSON.parse(String(call?.[1]?.body));
}

describe('DayGate', () => {
  it('lets a manager open the day with opening cash', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', ['day.openClose', 'order.take']));
    const mock = mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'POST /api/business-day/open': () => json({ id: 'd1' }, 201),
    });
    renderWithProviders(<DayGate>service</DayGate>);
    fireEvent.change(await screen.findByLabelText('Cash in the drawer (₹)'), {
      target: { value: '2,000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open the day' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/business-day/open').length).toBe(1);
    expect(body(mock, 'POST', '/api/business-day/open')).toEqual({ openingCash: 200000 });
  });

  it('asks a waiter to find a manager', async () => {
    useSession.getState().setSession(sessionBody('WAITER', ['order.take']));
    mockApi({ 'GET /api/business-day/current': () => json({ day: null }) });
    renderWithProviders(<DayGate>service</DayGate>);
    expect(
      await screen.findByText('The day has not been opened yet. Ask a manager to open it.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('service')).toBeNull();
  });

  it('shows service once the day is open', async () => {
    useSession.getState().setSession(sessionBody('WAITER', ['order.take']));
    mockApi({
      'GET /api/business-day/current': () =>
        json({
          day: {
            id: 'd1',
            status: 'OPEN',
            openingCash: 0,
            openedAt: '',
            openedBy: { id: 'u', name: 'M' },
          },
        }),
    });
    renderWithProviders(<DayGate>service</DayGate>);
    expect(await screen.findByText('service')).toBeInTheDocument();
  });
});

describe('FloorGrid', () => {
  it('opens a free table for the number of guests picked', async () => {
    useSession.getState().setSession(sessionBody('WAITER', ['order.take']));
    const onSelect = vi.fn();
    const mock = mockApi({
      'GET /api/floor/status': () => json(floor),
      'POST /api/orders': () => json({ id: 'new-order' }, 201),
    });
    renderWithProviders(<FloorGrid selectedOrderId={null} onSelect={onSelect} />);
    fireEvent.click(await screen.findByRole('button', { name: 'T1, free' }));
    fireEvent.click(screen.getByRole('button', { name: '3 guests' }));
    await expect.poll(() => onSelect.mock.calls.length).toBe(1);
    expect(onSelect).toHaveBeenCalledWith('new-order');
    expect(body(mock, 'POST', '/api/orders')).toEqual({ type: 'DINE_IN', tableId: T1, guests: 3 });
  });

  it('shows what a running table has and opens its order', async () => {
    useSession.getState().setSession(sessionBody('WAITER', ['order.take']));
    const onSelect = vi.fn();
    mockApi({ 'GET /api/floor/status': () => json(floor) });
    renderWithProviders(<FloorGrid selectedOrderId={null} onSelect={onSelect} />);
    fireEvent.click(await screen.findByRole('button', { name: 'T2, 2 items, ₹60' }));
    expect(onSelect).toHaveBeenCalledWith('o2');
  });
});

describe('ParcelList', () => {
  it('starts a new parcel order', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['order.take']));
    const onSelect = vi.fn();
    const mock = mockApi({
      'GET /api/orders': () =>
        json([
          {
            id: 'p1',
            type: 'PARCEL',
            status: 'OPEN',
            tableId: null,
            tableName: null,
            tokenNo: 4,
            customerName: null,
            guests: null,
            itemCount: 1,
            subtotal: 12000,
            createdAt: '',
          },
        ]),
      'POST /api/orders': () => json({ id: 'p2' }, 201),
    });
    renderWithProviders(<ParcelList selectedOrderId={null} onSelect={onSelect} />);
    expect(await screen.findByRole('button', { name: 'Parcel #4, ₹120' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New parcel' }));
    await expect.poll(() => onSelect.mock.calls.length).toBe(1);
    expect(onSelect).toHaveBeenCalledWith('p2');
    expect(body(mock, 'POST', '/api/orders')).toEqual({ type: 'PARCEL' });
  });
});
