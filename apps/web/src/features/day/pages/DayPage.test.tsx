import { act, fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { renderDayReport } from '../dayReport';
import type { DayReport } from '../types';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';

const MANAGER: Permission[] = ['day.openClose', 'reports.dayClose', 'bill.print'];
const OWNER: Permission[] = [...MANAGER, 'day.reopen'];

const today = {
  day: {
    id: 'd2',
    status: 'OPEN',
    openingCash: 100000,
    openedAt: '2026-10-06T03:30:00Z',
    openedBy: { id: 'm', name: 'Meena' },
  },
};

const clear = {
  day: { id: 'd2', openingCash: 100000 },
  blockers: { orders: [], bills: [] },
  cash: { opening: 100000, cashSales: 3200, cashExpenses: 0, expected: 103200 },
};

const report = (partial: Partial<DayReport> = {}): DayReport => ({
  day: {
    id: 'd2',
    status: 'CLOSED',
    openedAt: '2026-10-06T03:30:00Z',
    closedAt: '2026-10-06T17:30:00Z',
    openedBy: { id: 'm', name: 'Meena' },
    closedBy: { id: 'm', name: 'Meena' },
    closeNote: 'Short ₹2',
  },
  sales: {
    bills: 2,
    grossSubtotal: 39000,
    discounts: 0,
    packaging: 0,
    taxable: 39000,
    cgst: 975,
    sgst: 975,
    roundOff: 50,
    total: 41000,
  },
  payments: { CASH: 3200, UPI: 37800, CARD: 0 },
  byType: { DINE_IN: { orders: 2, total: 41000 }, PARCEL: { orders: 0, total: 0 } },
  topItems: [{ itemName: 'Paneer Tikka', variantName: 'Half', quantity: 2, amount: 36000 }],
  voids: [],
  cancels: [],
  discounts: [],
  expenses: { total: 0, cash: 0, byCategory: [] },
  cash: {
    opening: 100000,
    cashSales: 3200,
    cashExpenses: 0,
    expected: 103200,
    counted: 103000,
    variance: -200,
  },
  ...partial,
});

const days = [
  {
    id: 'd2',
    status: 'CLOSED',
    openedAt: '2026-10-06T03:30:00Z',
    closedAt: '2026-10-06T17:30:00Z',
    openingCash: 100000,
    expectedCash: 103200,
    countedCash: 103000,
    variance: -200,
    total: 41000,
  },
];

function as(permissions: Permission[], role: 'OWNER' | 'MANAGER' | 'CASHIER' = 'MANAGER') {
  useSession.getState().setSession(sessionBody(role, permissions));
}

describe('Day close', () => {
  it('lists what is still open and keeps the close button off', async () => {
    as(MANAGER);
    mockApi({
      'GET /api/business-day/current': () => json(today),
      'GET /api/business-day': () => json([]),
      'GET /api/business-day/close-check': () =>
        json({
          ...clear,
          blockers: {
            orders: [
              { id: 'o1', label: 'T1', status: 'OPEN' },
              { id: 'o4', label: 'Parcel #4', status: 'BILLED' },
            ],
            bills: [{ id: 'b1', billNo: 12, due: 47300 }],
          },
        }),
    });
    renderRoute('/day');
    const open = await screen.findByRole('list', { name: 'Still open' });
    expect(within(open).getByText('T1 — order open')).toBeInTheDocument();
    expect(within(open).getByText('Parcel #4 — bill printed, not paid')).toBeInTheDocument();
    expect(within(open).getByText('Bill 12 — ₹473 due')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();
  });

  it('closes the day with the counted cash and shows the report', async () => {
    as(MANAGER);
    const mock = mockApi({
      'GET /api/business-day/current': () => json(today),
      'GET /api/business-day': () => json([]),
      'GET /api/business-day/close-check': () => json(clear),
      'POST /api/business-day/close': () => json(report(), 201),
    });
    renderRoute('/day');
    expect(await screen.findByText('Expected in drawer')).toBeInTheDocument();
    expect(screen.getByText('₹1032')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Counted cash (₹)'), { target: { value: '1030' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Short ₹2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, close the day' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/business-day/close').length).toBe(1);
    expect(
      JSON.parse(String(callsTo(mock, 'POST', '/api/business-day/close')[0]?.[1]?.body)),
    ).toEqual({ countedCash: 103000, note: 'Short ₹2' });
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).getByText('−₹2')).toBeInTheDocument();
    expect(within(shown).getByText('Paneer Tikka (Half)')).toBeInTheDocument();
    expect(within(shown).getByRole('button', { name: 'Print report' })).toBeInTheDocument();
  });

  it('shows what blocked the close when the server refuses', async () => {
    as(MANAGER);
    mockApi({
      'GET /api/business-day/current': () => json(today),
      'GET /api/business-day': () => json([]),
      'GET /api/business-day/close-check': () => json(clear),
      'POST /api/business-day/close': () =>
        json(
          {
            code: 'DAY_HAS_OPEN_WORK',
            message:
              'Finish or cancel the open orders and settle every bill before closing the day.',
            blockers: { orders: [{ id: 'o9', label: 'T9', status: 'OPEN' }], bills: [] },
          },
          409,
        ),
    });
    renderRoute('/day');
    fireEvent.change(await screen.findByLabelText('Counted cash (₹)'), {
      target: { value: '1032' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, close the day' }));
    const open = await screen.findByRole('list', { name: 'Still open' });
    expect(within(open).getByText('T9 — order open')).toBeInTheDocument();
  });

  it('lets the manager close once the refused-for table is settled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'setInterval'] });
    try {
      as(MANAGER);
      let refused = false;
      let settled = false;
      mockApi({
        'GET /api/business-day/current': () => json(today),
        'GET /api/business-day': () => json([]),
        'GET /api/business-day/close-check': () =>
          json(
            refused && !settled
              ? {
                  ...clear,
                  blockers: { orders: [{ id: 'o9', label: 'T9', status: 'OPEN' }], bills: [] },
                }
              : clear,
          ),
        'POST /api/business-day/close': () => {
          refused = true;
          return json(
            {
              code: 'DAY_HAS_OPEN_WORK',
              message: 'Finish or cancel the open orders.',
              blockers: { orders: [{ id: 'o9', label: 'T9', status: 'OPEN' }], bills: [] },
            },
            409,
          );
        },
      });
      renderRoute('/day');
      fireEvent.change(await screen.findByLabelText('Counted cash (₹)'), {
        target: { value: '1032' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Yes, close the day' }));
      await screen.findByRole('list', { name: 'Still open' });
      expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();

      settled = true;
      await act(() => vi.advanceTimersByTimeAsync(16_000));
      await expect.poll(() => screen.queryByRole('list', { name: 'Still open' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Close day' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the report of a past day and lets the owner reopen the latest', async () => {
    as(OWNER, 'OWNER');
    const mock = mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(report()),
      'POST /api/business-day/d2/reopen': () => json(today.day, 201),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).getByText('₹410')).toBeInTheDocument();
    fireEvent.click(within(shown).getByRole('button', { name: 'Reopen day' }));
    fireEvent.change(within(shown).getByLabelText('Why reopen?'), {
      target: { value: 'Missed a bill' },
    });
    fireEvent.click(within(shown).getByRole('button', { name: 'Yes, reopen' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/business-day/d2/reopen').length).toBe(1);
    expect(
      JSON.parse(String(callsTo(mock, 'POST', '/api/business-day/d2/reopen')[0]?.[1]?.body)),
    ).toEqual({ reason: 'Missed a bill' });
  });

  it('does not offer reopen to a manager', async () => {
    as(MANAGER);
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(report()),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    await screen.findByRole('region', { name: 'Day report' });
    expect(screen.queryByRole('button', { name: 'Reopen day' })).toBeNull();
  });

  it('keeps cashiers out', async () => {
    as(['bill.print'], 'CASHIER');
    mockApi({});
    renderRoute('/day');
    expect(await screen.findByText('You do not have access to this screen.')).toBeInTheDocument();
  });
});

describe('renderDayReport', () => {
  it('prints the cash tally and escapes text', () => {
    const html = renderDayReport(
      report({ day: { ...report().day, closeNote: '<b>short</b>' } }),
      'Spice Garden',
    );
    expect(html).toContain('Expected in drawer');
    expect(html).toContain('Spice Garden');
    expect(html).toContain('&lt;b&gt;short');
    expect(html).not.toContain('<b>short');
  });
});
