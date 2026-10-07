import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const OWNER_PERMS = [
  'order.take',
  'bill.print',
  'users.manage',
  'settings.manage',
  'devices.manage',
  'menu.manage',
];

function signInAs(role: 'OWNER' | 'CASHIER' | 'WAITER', permissions: string[]) {
  useSession.getState().setSession(sessionBody(role, permissions));
}

describe('routes', () => {
  it.each([
    ['/pos', 'POS counter'],
    ['/captain', 'Captain app'],
  ])('%s renders the %s area for a permitted user', async (path, heading) => {
    signInAs('OWNER', OWNER_PERMS);
    renderRoute(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it('home links to the areas the user may open', async () => {
    signInAs('OWNER', OWNER_PERMS);
    renderRoute('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Restaurant POS' }),
    ).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    for (const name of ['POS counter', 'Captain app', 'Kitchen display', 'Admin']) {
      expect(main.getByRole('link', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
  });

  it('hides areas a waiter may not open', async () => {
    signInAs('WAITER', ['order.take']);
    renderRoute('/');
    const main = within(await screen.findByRole('main'));
    expect(await main.findByRole('link', { name: /^Captain app/ })).toBeInTheDocument();
    expect(main.queryByRole('link', { name: /^POS counter/ })).toBeNull();
    expect(main.queryByRole('link', { name: /^Admin/ })).toBeNull();
  });

  it('tells a waiter they cannot open the POS counter', async () => {
    signInAs('WAITER', ['order.take']);
    renderRoute('/pos');
    expect(await screen.findByText('You do not have access to this screen.')).toBeInTheDocument();
  });

  it('sends a signed-out user on an unregistered device to the manager sign-in', async () => {
    useSession.getState().clear();
    mockApi({ 'GET /api/devices/current': () => json({ code: 'DEVICE_NOT_REGISTERED' }, 401) });
    renderRoute('/pos');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends a signed-out user on a registered device to the PIN pad', async () => {
    useSession.getState().clear();
    mockApi({
      'GET /api/devices/current': () => json({ id: 'd1', name: 'Counter 1', type: 'POS' }),
      'GET /api/auth/staff': () => json([]),
    });
    renderRoute('/pos');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Who is signing in?' }),
    ).toBeInTheDocument();
  });

  it('restores the session from the refresh cookie on load', async () => {
    mockApi({
      'POST /api/auth/refresh': () => json(sessionBody('CASHIER', ['bill.print'], 'Arun')),
    });
    renderRoute('/pos');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'POS counter' }),
    ).toBeInTheDocument();
  });

  it('shows a loading state while the session is being restored', async () => {
    renderRoute('/pos');
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
  });

  it('unknown paths show a not-found page', async () => {
    signInAs('OWNER', OWNER_PERMS);
    renderRoute('/nope');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });

  it('every page shows the server status', async () => {
    renderRoute('/kds');
    expect(await screen.findByText('Checking server…')).toBeInTheDocument();
  });

  it('says the server is unreachable instead of signing out when restore fails', async () => {
    mockApi({
      'POST /api/auth/refresh': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderRoute('/pos');
    expect(await screen.findByText('Cannot reach the server. Retrying…')).toBeInTheDocument();
  });
});
