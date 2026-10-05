import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { callsTo, json, mockApi } from '../test/mock-api';
import { renderRoute } from '../test/render';

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

  it('refuses a counter device', async () => {
    mockApi({ 'GET /api/devices/current': () => json({ id: 'd1', name: 'Counter', type: 'POS' }) });
    renderRoute('/kds');
    expect(
      await screen.findByText('Counter is registered as a counter, not a kitchen screen.'),
    ).toBeInTheDocument();
  });

  it('shows tickets in New, Preparing and Ready columns', async () => {
    mockApi({ 'GET /api/devices/current': kdsDevice, 'GET /api/kds/kots': () => json(tickets) });
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
    mockApi({ 'GET /api/devices/current': kdsDevice, 'GET /api/kds/kots': () => json(tickets) });
    renderRoute('/kds');
    fireEvent.change(await screen.findByLabelText('Station'), { target: { value: 'tandoor' } });
    expect(screen.queryByRole('article', { name: 'KOT 1, T1' })).toBeNull();
    expect(screen.getByRole('article', { name: 'KOT 2, Parcel #5' })).toBeInTheDocument();
  });
});
