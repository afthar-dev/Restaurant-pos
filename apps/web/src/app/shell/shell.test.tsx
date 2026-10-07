import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';
import { visibleNav } from '../navigation';

const labels = (permissions: Permission[]) => visibleNav(permissions).map((n) => n.label);

describe('navigation', () => {
  it('shows each role only the areas it can use', () => {
    expect(labels(['order.take', 'menu.availability'])).toEqual([
      'Home',
      'Captain',
      'Kitchen',
      'Availability',
    ]);
    expect(labels(['bill.print', 'order.take', 'expense.manage'])).toEqual([
      'Home',
      'POS',
      'Captain',
      'Kitchen',
      'Expenses',
    ]);
    expect(labels(['reports.all', 'stock.manage', 'users.manage'])).toEqual(
      expect.arrayContaining(['Reports', 'Stock', 'Admin']),
    );
    expect(labels([])).toEqual([]);
  });
});

const DAY_OPEN = {
  day: {
    id: 'd1',
    status: 'OPEN',
    openingCash: 0,
    openedAt: '2026-10-07T03:32:00Z',
    openedBy: { id: 'm', name: 'Meena' },
  },
};

describe('app shell header', () => {
  it('shows when the day opened', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print']));
    mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/outlet': () => json({ name: 'Spice Garden' }),
    });
    renderRoute('/expenses');
    expect((await screen.findAllByText(/^Day open since/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Spice Garden, home' }).length).toBeGreaterThan(0);
  });

  it('tells a manager the day is not open and links to open it', async () => {
    useSession
      .getState()
      .setSession(sessionBody('MANAGER', ['day.openClose', 'bill.print', 'expense.manage']));
    mockApi({ 'GET /api/business-day/current': () => json({ day: null }) });
    renderRoute('/expenses');
    expect((await screen.findAllByText('Day not open')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Open day' }).length).toBeGreaterThan(0);
  });

  it('does not offer to open the day to a waiter', async () => {
    useSession.getState().setSession(sessionBody('WAITER', ['order.take']));
    mockApi({ 'GET /api/business-day/current': () => json({ day: null }) });
    renderRoute('/captain');
    expect((await screen.findAllByText('Day not open')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Open day' })).toBeNull();
  });

  it('signs out from the account menu', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print'], 'Ravi'));
    const mock = mockApi({ 'POST /api/auth/logout': () => json(undefined, 204) });
    renderRoute('/expenses');
    const account = await screen.findByRole('button', { name: 'Account: Ravi' });
    // Opened with the keyboard: the menu must work without a mouse.
    account.focus();
    fireEvent.keyDown(account, { key: 'Enter' });
    const menu = await screen.findByRole('menu', { name: 'Account: Ravi' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/auth/logout').length).toBe(1);
    await expect.poll(() => useSession.getState().status).toBe('anonymous');
  });
});
