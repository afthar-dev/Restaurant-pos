import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_RETRY_MS } from '@/features/auth';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const now = new Date().toISOString();

function ticket(partial: Record<string, unknown>) {
  return {
    orderId: 'o1',
    type: 'NEW',
    status: 'NEW',
    stationId: 'kitchen',
    stationName: 'Kitchen',
    orderType: 'DINE_IN',
    tableName: 'T1',
    tokenNo: null,
    guests: 2,
    waiterName: 'Arun',
    createdAt: now,
    lines: [
      {
        id: 'l1',
        itemName: 'Paneer Tikka',
        variantName: 'Half',
        quantity: 2,
        addons: ['Cheese'],
        comboComponents: [],
        note: 'less spicy',
      },
    ],
    ...partial,
  };
}

const tickets = [
  ticket({ id: 'k1', kotNo: 1 }),
  ticket({
    id: 'k2',
    kotNo: 2,
    status: 'READY',
    orderType: 'PARCEL',
    tableName: null,
    tokenNo: 5,
    stationId: 'tandoor',
    stationName: 'Tandoor',
  }),
  ticket({ id: 'k3', kotNo: 3, type: 'CANCEL' }),
];

const kdsDevice = () => json({ id: 'd1', name: 'Kitchen screen', type: 'KDS' });
const stations = [
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'tandoor', name: 'Tandoor' },
  { id: 'bar', name: 'Bar' },
];

describe('Kitchen display', () => {
  it('explains how to set up an unregistered screen', async () => {
    mockApi({ 'GET /api/devices/current': () => json({ code: 'DEVICE_NOT_REGISTERED' }, 401) });
    renderRoute('/kds');
    expect(
      await screen.findByText(
        'This screen is not set up yet. A manager can register it as a kitchen screen in Admin → Devices.',
      ),
    ).toBeInTheDocument();
  });

  it('lets a manager set up this screen as the kitchen screen in one tap', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', ['devices.manage'], 'Meena'));
    let registered = false;
    const mock = mockApi({
      'GET /api/devices/current': () =>
        registered ? kdsDevice() : json({ code: 'DEVICE_NOT_REGISTERED' }, 401),
      'POST /api/devices': () => {
        registered = true;
        return json({ id: 'd9', name: 'Kitchen', type: 'KDS' }, 201);
      },
      'GET /api/kds/stations': () => json(stations),
      'GET /api/kds/kots': () => json([]),
    });
    renderRoute('/kds');
    fireEvent.click(await screen.findByRole('button', { name: 'Set up this screen' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/devices').length).toBe(1);
    expect(JSON.parse(String(callsTo(mock, 'POST', '/api/devices')[0]?.[1]?.body))).toEqual({
      name: 'Kitchen',
      type: 'KDS',
    });
    expect(await screen.findByRole('heading', { name: /New/ })).toBeInTheDocument();
  });

  it('offers sign-in when nobody is signed in on an unregistered screen', async () => {
    mockApi({ 'GET /api/devices/current': () => json({ code: 'DEVICE_NOT_REGISTERED' }, 401) });
    renderRoute('/kds');
    expect(await screen.findByRole('link', { name: 'Sign in to set it up' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('warns before turning a counter into the kitchen screen', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', ['devices.manage'], 'Meena'));
    mockApi({ 'GET /api/devices/current': () => json({ id: 'd1', name: 'Counter', type: 'POS' }) });
    renderRoute('/kds');
    expect(
      await screen.findByRole('button', { name: 'Use this screen for the kitchen instead' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Counter will stop working as a counter.')).toBeInTheDocument();
  });

  it('tells a waiter phone apart from a counter', async () => {
    mockApi({
      'GET /api/devices/current': () => json({ id: 'd2', name: "Ravi's phone", type: 'CAPTAIN' }),
    });
    renderRoute('/kds');
    expect(
      await screen.findByText(
        "Ravi's phone is registered as a waiter phone, not a kitchen screen.",
      ),
    ).toBeInTheDocument();
  });

  it('refuses a counter device', async () => {
    mockApi({ 'GET /api/devices/current': () => json({ id: 'd1', name: 'Counter', type: 'POS' }) });
    renderRoute('/kds');
    expect(
      await screen.findByText('Counter is registered as a counter, not a kitchen screen.'),
    ).toBeInTheDocument();
  });

  it('shows tickets in New, Preparing and Ready columns', async () => {
    mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/kots': () => json(tickets),
      'GET /api/kds/stations': () => json(stations),
    });
    renderRoute('/kds');
    const newColumn = await screen.findByRole('region', { name: 'New' });
    const first = within(newColumn).getByRole('article', { name: 'KOT 1, T1' });
    expect(within(first).getByText('2 × Paneer Tikka (Half)')).toBeInTheDocument();
    expect(within(first).getByText('Cheese')).toBeInTheDocument();
    expect(within(first).getByText('“less spicy”')).toBeInTheDocument();
    const ready = screen.getByRole('region', { name: 'Ready' });
    expect(within(ready).getByRole('article', { name: 'KOT 2, Parcel #5' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'KOT 3, T1, cancelled' })).toBeInTheDocument();
  });

  it('shows ticket-shaped placeholders while tickets load', async () => {
    mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/stations': () => json(stations),
    });
    renderRoute('/kds');
    const loading = await screen.findByRole('status', { name: 'Loading tickets' });
    expect(loading.querySelectorAll('[data-skeleton="ticket"]').length).toBeGreaterThanOrEqual(3);
  });

  it('flags a ticket that has waited too long', async () => {
    const old = new Date(Date.now() - 32 * 60_000).toISOString();
    mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/stations': () => json(stations),
      'GET /api/kds/kots': () => json([ticket({ id: 'k9', kotNo: 9, createdAt: old })]),
    });
    renderRoute('/kds');
    expect(await screen.findByText('Late · 32 min')).toBeInTheDocument();
  });

  it('shows what each ticket button does with an icon', async () => {
    mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/stations': () => json(stations),
      'GET /api/kds/kots': () => json(tickets),
    });
    renderRoute('/kds');
    const start = await screen.findByRole('button', { name: 'Start KOT 1' });
    expect(start.querySelector('svg.lucide-flame')).not.toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Picked up KOT 2' })
        .querySelector('svg.lucide-hand-platter'),
    ).not.toBeNull();
  });

  it('starts, finishes and dismisses tickets', async () => {
    const mock = mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/kots': () => json(tickets),
      'PATCH /api/kds/kots/k1': () => json({ id: 'k1', status: 'PREPARING' }),
      'PATCH /api/kds/kots/k2': () => json({ id: 'k2', status: 'SERVED' }),
      'PATCH /api/kds/kots/k3': () => json({ id: 'k3', status: 'SERVED' }),
    });
    renderRoute('/kds');
    fireEvent.click(await screen.findByRole('button', { name: 'Start KOT 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Picked up KOT 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss KOT 3' }));
    await expect.poll(() => callsTo(mock, 'PATCH', '/api/kds/kots/k3').length).toBe(1);
    const statusOf = (id: string) =>
      JSON.parse(String(callsTo(mock, 'PATCH', `/api/kds/kots/${id}`)[0]?.[1]?.body)).status;
    expect(statusOf('k1')).toBe('PREPARING');
    expect(statusOf('k2')).toBe('SERVED');
    expect(statusOf('k3')).toBe('SERVED');
  });

  it('filters to one station', async () => {
    mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/kots': () => json(tickets),
      'GET /api/kds/stations': () => json(stations),
    });
    renderRoute('/kds');
    fireEvent.change(await screen.findByLabelText('Station'), { target: { value: 'tandoor' } });
    expect(screen.queryByRole('article', { name: 'KOT 1, T1' })).toBeNull();
    expect(screen.getByRole('article', { name: 'KOT 2, Parcel #5' })).toBeInTheDocument();
  });

  it('offers stations that have no tickets yet', async () => {
    mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/kots': () => json(tickets),
      'GET /api/kds/stations': () => json(stations),
    });
    renderRoute('/kds');
    expect(await screen.findByRole('option', { name: 'Bar' })).toBeInTheDocument();
  });

  it('forgets a remembered station that no longer exists', async () => {
    localStorage.setItem('rpos.kds.station', 'archived-station');
    mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/kots': () => json(tickets),
      'GET /api/kds/stations': () => json(stations),
    });
    renderRoute('/kds');
    await screen.findByRole('option', { name: 'Bar' });
    await expect.poll(() => (screen.getByLabelText('Station') as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('article', { name: 'KOT 1, T1' })).toBeInTheDocument();
    expect(localStorage.getItem('rpos.kds.station')).toBe('');
  });

  it('keeps the tickets on screen when a refresh fails', async () => {
    let fail = false;
    mockApi({
      'GET /api/devices/current': kdsDevice,
      'GET /api/kds/kots': () =>
        fail ? json({ code: 'SERVER_ERROR', message: 'Down' }, 500) : json(tickets),
      'GET /api/kds/stations': () => json(stations),
    });
    const { queryClient } = renderRoute('/kds');
    await screen.findByRole('article', { name: 'KOT 1, T1' });
    fail = true;
    await queryClient.refetchQueries({ queryKey: ['kds'], exact: true });
    expect(screen.getByRole('article', { name: 'KOT 1, T1' })).toBeInTheDocument();
  });
});

describe('Kitchen display start-up', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps retrying when the server was unreachable at boot', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'setInterval'] });
    let up = false;
    mockApi({
      'GET /api/devices/current': () =>
        up ? kdsDevice() : json({ code: 'OFFLINE', message: 'Down' }, 503),
      'GET /api/kds/kots': () => json(tickets),
      'GET /api/kds/stations': () => json(stations),
    });
    renderRoute('/kds');
    expect(await screen.findByText('Cannot reach the server. Retrying…')).toBeInTheDocument();
    up = true;
    await act(() => vi.advanceTimersByTimeAsync(DEVICE_RETRY_MS));
    expect(await screen.findByRole('region', { name: 'New' })).toBeInTheDocument();
  });
});
