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
    ]) {
      expect(callsTo(mock, 'GET', path)).toHaveLength(0);
    }
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
});
