import { screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { expectNoAxeViolations } from '@/test/a11y';
import { renderRoute } from '@/test/render';

const DAY_OPEN = {
  day: {
    id: 'd1',
    status: 'OPEN',
    openingCash: 100000,
    openedAt: '2026-10-07T03:30:00Z',
    openedBy: { id: 'm', name: 'Meena' },
  },
};

const SALES = {
  range: { from: '2026-10-07', to: '2026-10-07' },
  days: [],
  summary: {
    bills: 12,
    grossSubtotal: 0,
    discounts: 0,
    packaging: 0,
    taxable: 0,
    collected: 0,
    unpaid: 0,
    exempt: 0,
    gstBreakup: [],
    cgst: 0,
    sgst: 0,
    roundOff: 0,
    total: 1240000,
    averageBill: 103333,
    payments: { CASH: 0, UPI: 0, CARD: 0 },
    byType: { DINE_IN: { orders: 0, total: 0 }, PARCEL: { orders: 0, total: 0 } },
    expenses: { total: 0, byCategory: [] },
    net: 1240000,
  },
  items: [],
  categories: [],
  hours: [],
};

const CLOSE_CHECK = {
  day: { id: 'd1', openingCash: 100000 },
  blockers: {
    orders: [{ id: 'o1', label: 'T1', status: 'OPEN' }],
    bills: [{ id: 'b1', billNo: 4, due: 5000 }],
  },
  cash: { opening: 100000, cashSales: 3200, cashExpenses: 1000, expected: 102200 },
};

const OWNER: Permission[] = [
  'reports.all',
  'day.openClose',
  'order.approveQr',
  'stock.manage',
  'bill.print',
];

describe('HomePage', () => {
  it('shows the owner today’s sales, open work, QR orders and low stock', async () => {
    useSession.getState().setSession(sessionBody('OWNER', OWNER, 'Asha'));
    mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/reports/sales': () => json(SALES),
      'GET /api/business-day/close-check': () => json(CLOSE_CHECK),
      'GET /api/qr/pending': () => json([{ id: 'q1' }, { id: 'q2' }]),
      'GET /api/stock/items': () =>
        json([
          { id: 's1', name: 'Onion', unit: 'kg', low: true, currentMilli: 0, minLevelMilli: 1 },
        ]),
    });
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Asha' })).toBeVisible();
    expect(await screen.findByText('₹12,400')).toBeInTheDocument();
    expect(await screen.findByText('2 QR orders waiting for approval')).toBeInTheDocument();
    expect(await screen.findByText('Before closing the day')).toBeInTheDocument();
    expect(screen.getByText('₹1,022')).toBeInTheDocument();
    expect(await screen.findByText('Onion')).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('never asks the server for owner-only numbers on a cashier’s home', async () => {
    useSession.getState().setSession(sessionBody('CASHIER', ['bill.print', 'expense.manage']));
    const mock = mockApi({ 'GET /api/business-day/current': () => json(DAY_OPEN) });
    renderRoute('/');
    const goTo = within(await screen.findByRole('region', { name: 'Go to' }));
    expect(goTo.getByRole('link', { name: /^POS counter/ })).toBeInTheDocument();
    expect(goTo.getByRole('link', { name: /^Expenses/ })).toBeInTheDocument();
    for (const path of [
      '/api/reports/sales',
      '/api/stock/items',
      '/api/business-day/close-check',
      '/api/users',
      '/api/printers',
      '/api/menu',
    ]) {
      expect(callsTo(mock, 'GET', path)).toHaveLength(0);
    }
    // Exact path: the sign-in check asks for /api/devices/current, which is fine.
    expect(
      callsTo(mock, 'GET', '/api/devices').filter(([url]) => String(url) === '/api/devices'),
    ).toHaveLength(0);
    expect(screen.queryByText('Get your restaurant ready')).toBeNull();
  });

  it('says when the day is not open, with a way in for managers only', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', ['day.openClose', 'bill.print']));
    const mock = mockApi({ 'GET /api/business-day/current': () => json({ day: null }) });
    renderRoute('/');
    expect(
      await screen.findByText(/The business day is not open\. Open it on the POS/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the day' })).toBeInTheDocument();
    expect(callsTo(mock, 'GET', '/api/business-day/close-check')).toHaveLength(0);
  });

  it('sends a waiter without the POS to the captain app to review QR orders', async () => {
    useSession
      .getState()
      .setSession(sessionBody('WAITER', ['order.take', 'order.approveQr'], 'Ravi'));
    mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/qr/pending': () => json([{ id: 'q1' }]),
    });
    renderRoute('/');
    expect(await screen.findByText('1 QR order waiting for approval')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/captain');
  });
  it('asks a new owner to finish setup and links to the guide', async () => {
    localStorage.clear();
    useSession
      .getState()
      .setSession(sessionBody('OWNER', ['settings.manage', 'menu.manage'], 'Asha'));
    mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/outlet': () =>
        json({
          name: 'Main Outlet',
          gstin: null,
          taxScheme: 'REGULAR',
          address: null,
          phone: null,
        }),
      'GET /api/menu': () => json({ categories: [] }),
      'GET /api/floor': () => json([]),
      'GET /api/printers': () => json([]),
    });
    renderRoute('/');
    expect(await screen.findByText('Get your restaurant ready')).toBeInTheDocument();
    expect(screen.getByText('0 of 4 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue setup' })).toHaveAttribute('href', '/setup');
  });

  it('hides the setup card once setup is complete', async () => {
    localStorage.setItem('rpos.setup.skipped', JSON.stringify(['tables', 'printer']));
    useSession
      .getState()
      .setSession(sessionBody('OWNER', ['settings.manage', 'menu.manage'], 'Asha'));
    const mock = mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/outlet': () =>
        json({
          name: 'Anna Mess',
          gstin: null,
          taxScheme: 'NONE',
          address: 'MG Road',
          phone: '9000000001',
        }),
      'GET /api/menu': () => json({ categories: [{ items: [{ id: 'i1' }] }] }),
      'GET /api/floor': () => json([]),
      'GET /api/printers': () => json([]),
    });
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Asha' })).toBeVisible();
    await expect.poll(() => callsTo(mock, 'GET', '/api/printers').length).toBe(1);
    // Let the last answers reach the screen before checking the card stayed away.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText('Get your restaurant ready')).toBeNull();
    localStorage.clear();
  });
  it('shows the owner the last 7 days with empty slots for closed days', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['reports.all'], 'Asha'));
    const to = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const shift = (n: number) =>
      new Date(Date.parse(`${to}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
    const week = {
      ...SALES,
      days: [
        {
          dayId: 'a',
          date: shift(1),
          status: 'CLOSED',
          bills: 4,
          total: 200_000,
          cash: 0,
          upi: 0,
          card: 0,
          collected: 0,
          unpaid: 0,
          expenses: 0,
        },
        {
          dayId: 'b',
          date: to,
          status: 'OPEN',
          bills: 2,
          total: 100_000,
          cash: 0,
          upi: 0,
          card: 0,
          collected: 0,
          unpaid: 0,
          expenses: 0,
        },
        {
          dayId: 'c',
          date: to,
          status: 'CLOSED',
          bills: 1,
          total: 50_000,
          cash: 0,
          upi: 0,
          card: 0,
          collected: 0,
          unpaid: 0,
          expenses: 0,
        },
      ],
    };
    const mock = mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/reports/sales': () => json(week),
    });
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 2, name: 'Last 7 days' })).toBeVisible();
    expect(screen.getByText('Today ₹1,500 · 7-day total ₹3,500')).toBeInTheDocument();
    const data = within(await screen.findByRole('list', { name: 'Last 7 days data' }));
    const days = data.getAllByRole('listitem');
    expect(days).toHaveLength(7);
    expect(days[5]).toHaveTextContent('₹2,000 · 4 bills');
    expect(days[4]).toHaveTextContent('₹0 · 0 bills');
    // Bars only for the two days with sales (yesterday and today).
    expect(document.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'See reports' })).toHaveAttribute('href', '/reports');
    const weekCall = callsTo(mock, 'GET', '/api/reports/sales').find(([url]) =>
      String(url).includes(`from=${shift(6)}`),
    );
    expect(weekCall).toBeDefined();
  });
});
