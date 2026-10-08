import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const ARUN = '00000000-0000-4000-8000-0000000000a1';

describe('PinPage', () => {
  it('signs a staff member in with their PIN', async () => {
    useSession.getState().clear();
    const mock = mockApi({
      'GET /api/devices/current': () => json({ id: 'd1', name: 'Counter 1', type: 'POS' }),
      'GET /api/auth/staff': () =>
        json([
          { id: ARUN, name: 'Arun', role: 'CASHIER' },
          { id: '00000000-0000-4000-8000-0000000000b2', name: 'Meera', role: 'MANAGER' },
        ]),
      'POST /api/auth/pin-login': () =>
        json(sessionBody('CASHIER', ['order.take', 'bill.print'], 'Arun')),
    });
    renderRoute('/pin');

    fireEvent.click(await screen.findByRole('button', { name: /Arun/ }));
    for (const digit of ['1', '2', '3', '4']) {
      fireEvent.click(screen.getByRole('button', { name: digit }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /^Welcome, / }),
    ).toBeInTheDocument();
    const call = mock.mock.calls.find(([url]) => String(url) === '/api/auth/pin-login');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ userId: ARUN, pin: '1234' });
  });

  it('keeps Sign in disabled until 4 digits are entered', async () => {
    useSession.getState().clear();
    mockApi({
      'GET /api/devices/current': () => json({ id: 'd1', name: 'Counter 1', type: 'POS' }),
      'GET /api/auth/staff': () => json([{ id: ARUN, name: 'Arun', role: 'CASHIER' }]),
    });
    renderRoute('/pin');
    fireEvent.click(await screen.findByRole('button', { name: /Arun/ }));
    for (const digit of ['1', '2', '3'])
      fireEvent.click(screen.getByRole('button', { name: digit }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('shows a wrong-PIN message', async () => {
    useSession.getState().clear();
    mockApi({
      'GET /api/devices/current': () => json({ id: 'd1', name: 'Counter 1', type: 'POS' }),
      'GET /api/auth/staff': () => json([{ id: ARUN, name: 'Arun', role: 'CASHIER' }]),
      'POST /api/auth/pin-login': () => json({ code: 'INVALID_CREDENTIALS', message: 'x' }, 401),
    });
    renderRoute('/pin');
    fireEvent.click(await screen.findByRole('button', { name: /Arun/ }));
    for (const digit of ['9', '9', '9', '9'])
      fireEvent.click(screen.getByRole('button', { name: digit }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN.');
  });

  it('explains what to do on an unregistered device', async () => {
    useSession.getState().clear();
    mockApi({
      'GET /api/devices/current': () => json({ code: 'DEVICE_NOT_REGISTERED' }, 401),
    });
    renderRoute('/pin');
    expect(
      await screen.findByText(
        'This device is not registered. Ask a manager to sign in and register it.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manager sign in' })).toBeInTheDocument();
  });
});
