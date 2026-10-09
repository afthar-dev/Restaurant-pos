import { fireEvent, screen } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { expectNoAxeViolations } from '@/test/a11y';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const OWNER: Permission[] = [
  'settings.manage',
  'menu.manage',
  'users.manage',
  'devices.manage',
  'bill.print',
];

const OUTLET = {
  name: 'Main Outlet',
  gstin: null,
  taxScheme: 'REGULAR',
  address: null,
  phone: null,
};

function freshApi(overrides = {}) {
  return mockApi({
    'GET /api/outlet': () => json(OUTLET),
    'GET /api/menu': () => json({ categories: [{ id: 'c1', name: 'Starters', items: [] }] }),
    'GET /api/floor': () => json([]),
    'GET /api/printers': () => json([]),
    'GET /api/users': () =>
      json([{ id: 'u1', name: 'Asha', role: 'OWNER', hasPin: true, archivedAt: null }]),
    'GET /api/devices': () => json([]),
    ...overrides,
  });
}

beforeEach(() => localStorage.clear());

describe('SetupPage', () => {
  it('walks a new restaurant through every step', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    freshApi();
    renderRoute('/setup');
    expect(await screen.findByRole('heading', { level: 1, name: 'Setup guide' })).toBeVisible();
    expect(await screen.findByText('0 of 6 done')).toBeInTheDocument();
    expect(screen.getAllByText('To do')).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'Set up Restaurant details' })).toHaveAttribute(
      'href',
      '/admin/settings?from=setup',
    );
    expect(screen.getByRole('link', { name: 'Set up This counter' })).toHaveAttribute(
      'href',
      '/admin/devices?from=setup',
    );
    await expectNoAxeViolations();
  });

  it('skips an optional step and undoes it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    freshApi();
    renderRoute('/setup');
    fireEvent.click(await screen.findByRole('button', { name: 'We only do parcels' }));
    expect(screen.getByText('1 of 6 done')).toBeInTheDocument();
    expect(screen.getByText('Skipped: We only do parcels')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('rpos.setup.skipped')!)).toEqual(['tables']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo skip for Tables and QR stickers' }));
    expect(screen.getByText('0 of 6 done')).toBeInTheDocument();
  });

  it('shows a manager only the steps they may do and asks nothing else', async () => {
    useSession
      .getState()
      .setSession(sessionBody('MANAGER', ['settings.manage', 'menu.manage'], 'Meena'));
    const mock = freshApi();
    renderRoute('/setup');
    expect(await screen.findByText('0 of 4 done')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Staff' })).toBeNull();
    expect(callsTo(mock, 'GET', '/api/users')).toHaveLength(0);
    expect(
      callsTo(mock, 'GET', '/api/devices').filter(([url]) => String(url) === '/api/devices'),
    ).toHaveLength(0);
  });

  it('says when a check failed and retries it', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    let calls = 0;
    freshApi({
      'GET /api/devices': () =>
        ++calls === 1 ? json({ code: 'INTERNAL', message: 'Down' }, 500) : json([]),
    });
    renderRoute('/setup');
    fireEvent.click(await screen.findByRole('button', { name: 'Retry This counter' }));
    expect(await screen.findByRole('link', { name: 'Set up This counter' })).toBeInTheDocument();
  });

  it('says the restaurant is ready when everything is done or skipped', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    localStorage.setItem('rpos.setup.skipped', JSON.stringify(['tables', 'printer', 'staff']));
    freshApi({
      'GET /api/outlet': () =>
        json({
          ...OUTLET,
          name: 'Anna Mess',
          address: '12 MG Road',
          phone: '9000000001',
          gstin: '29ABCDE1234F1Z5',
        }),
      'GET /api/menu': () =>
        json({ categories: [{ id: 'c1', name: 'Starters', items: [{ id: 'i1' }] }] }),
      'GET /api/devices': () => json([{ id: 'd1', revokedAt: null }]),
    });
    renderRoute('/setup');
    expect(await screen.findByText('6 of 6 done')).toBeInTheDocument();
    expect(
      screen.getByText('Ready to serve. Open the day from the POS to take the first order.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to POS' })).toHaveAttribute('href', '/pos');
  });

  it('refuses a cashier', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print'], 'Ravi'));
    const mock = freshApi();
    renderRoute('/setup');
    expect(await screen.findByText(/do not have access/i)).toBeInTheDocument();
    expect(callsTo(mock, 'GET', '/api/users')).toHaveLength(0);
    expect(callsTo(mock, 'GET', '/api/printers')).toHaveLength(0);
  });
});
