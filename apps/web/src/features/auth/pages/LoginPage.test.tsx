import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

function fillAndSubmit(phone: string, password: string) {
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('signs in and goes to the home screen', async () => {
    useSession.getState().clear();
    const mock = mockApi({
      'POST /api/auth/login': () => json(sessionBody('OWNER', ['users.manage'], 'Priya')),
      'GET /api/devices/current': () => json({ code: 'DEVICE_NOT_REGISTERED' }, 401),
    });
    renderRoute('/login');

    fillAndSubmit('9876543210', 'owner-pass-1');

    expect(
      await screen.findByRole('heading', { level: 1, name: /^Welcome, / }),
    ).toBeInTheDocument();
    expect(screen.getByText('Priya')).toBeInTheDocument();
    const loginCall = mock.mock.calls.find(([url]) => String(url) === '/api/auth/login');
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      phone: '9876543210',
      password: 'owner-pass-1',
    });
  });

  it('shows a clear message for a wrong password', async () => {
    useSession.getState().clear();
    mockApi({
      'POST /api/auth/login': () => json({ code: 'INVALID_CREDENTIALS', message: 'x' }, 401),
    });
    renderRoute('/login');
    fillAndSubmit('9876543210', 'wrong-pass');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong phone number or password.');
  });

  it('tells a locked user how long to wait', async () => {
    useSession.getState().clear();
    mockApi({
      'POST /api/auth/login': () =>
        json({ code: 'LOCKED', message: 'x', retryAfterSeconds: 840 }, 423),
    });
    renderRoute('/login');
    fillAndSubmit('9876543210', 'whatever-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again in 14 minutes.',
    );
  });

  it('checks the phone number before sending', async () => {
    useSession.getState().clear();
    const mock = mockApi({});
    renderRoute('/login');
    fillAndSubmit('12345', 'whatever-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a 10-digit mobile number');
    expect(mock).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });
});
