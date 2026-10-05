import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '../../auth/store';
import { callsTo, json, mockApi, sessionBody } from '../../test/mock-api';
import { renderRoute } from '../../test/render';

const DEVICE_ID = '00000000-0000-4000-8000-00000000d001';
const devices = [
  {
    id: DEVICE_ID,
    name: 'Counter 1',
    type: 'POS',
    createdBy: { id: 'u1', name: 'Meera' },
    createdAt: '2026-10-01T10:00:00Z',
    lastSeenAt: '2026-10-05T09:00:00Z',
    revokedAt: null,
  },
];

describe('DevicesPage', () => {
  it('registers this browser as a device', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', ['devices.manage']));
    const mock = mockApi({
      'GET /api/devices': () => json(devices),
      'POST /api/devices': ({ body }) => json({ id: 'd2', ...(body as object) }, 201),
    });
    renderRoute('/admin/devices');

    fireEvent.change(await screen.findByLabelText('Device name'), {
      target: { value: 'Kitchen screen' },
    });
    fireEvent.change(screen.getByLabelText('Used for'), { target: { value: 'KDS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register this device' }));

    expect(
      await screen.findByText('This device is now registered as Kitchen screen.'),
    ).toBeInTheDocument();
    const [call] = callsTo(mock, 'POST', '/api/devices');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ name: 'Kitchen screen', type: 'KDS' });
  });

  it('revokes a device only after confirming', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', ['devices.manage']));
    const mock = mockApi({
      'GET /api/devices': () => json(devices),
      [`DELETE /api/devices/${DEVICE_ID}`]: () => new Response(null, { status: 204 }),
    });
    renderRoute('/admin/devices');

    const row = (await screen.findByText('Counter 1')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Revoke' }));
    expect(callsTo(mock, 'DELETE', `/api/devices/${DEVICE_ID}`)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke Counter 1' }));
    await screen.findByText('Counter 1');
    expect(callsTo(mock, 'DELETE', `/api/devices/${DEVICE_ID}`)).toHaveLength(1);
  });
});
