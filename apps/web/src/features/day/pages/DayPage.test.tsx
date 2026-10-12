import { act, fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { renderDayReport } from '../dayReport';
import type { DayReport } from '../types';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { withDeviceTimeZone } from '@/test/timezone';
import { renderRoute } from '@/test/render';

const MANAGER: Permission[] = ['day.openClose', 'payment.take', 'reports.dayClose', 'bill.print'];
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

// The closing screen asks blind: no expected cash comes back.
const clear = {
  day: { id: 'd2', openingCash: 100000 },
  blockers: { orders: [], bills: [] },
  cash: {},
};

const CHECK = 'POST /api/business-day/d2/close/check-count';
const checked = { expected: 103200, variance: -200, needsReason: false };

/** Uses the typed total instead of the note counter, then checks it. */
async function checkTotal(value: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Type total instead' }));
  fireEvent.change(screen.getByLabelText('Counted cash (₹)'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Check count' }));
  await screen.findByText('Expected in drawer');
}

const report = (partial: Partial<DayReport> = {}): DayReport => ({
  day: {
    id: 'd2',
    status: 'CLOSED',
    openedAt: '2026-10-06T03:30:00Z',
    closedAt: '2026-10-06T17:30:00Z',
    openedBy: { id: 'm', name: 'Meena' },
    closedBy: { id: 'm', name: 'Meena' },
    closeNote: 'Short ₹2',
    closeCount: null,
    closeReasonCode: null,
    firstCount: null,
  },
  sales: {
    bills: 2,
    grossSubtotal: 39000,
    discounts: 0,
    packaging: 0,
    taxable: 39000,
    collected: 41000,
    unpaid: 0,
    exempt: 0,
    gstBreakup: [{ ratePercent: 5, taxable: 39000, cgst: 975, sgst: 975 }],
    cgst: 975,
    sgst: 975,
    roundOff: 50,
    total: 41000,
  },
  payments: { CASH: 3200, UPI: 37800, CARD: 0 },
  refunds: { total: 0, CASH: 0, UPI: 0, CARD: 0, bills: [] },
  reconciliation: {
    upi: { withRef: 0, withoutRef: 0, amountWithout: 0 },
    card: { withRef: 0, withoutRef: 0, amountWithout: 0 },
    missing: [],
  },
  reopened: null,
  byType: { DINE_IN: { orders: 2, total: 41000 }, PARCEL: { orders: 0, total: 0 } },
  topItems: [{ itemName: 'Paneer Tikka', variantName: 'Half', quantity: 2, amount: 36000 }],
  voids: [],
  reprints: [],
  cancels: [],
  discounts: [],
  expenses: { total: 0, cash: 0, byCategory: [] },
  cashMovements: { totals: { payIn: 0, payOut: 0, drop: 0 }, list: [] },
  cash: {
    opening: 100000,
    cashSales: 3200,
    cashRefunds: 0,
    cashExpenses: 0,
    payIns: 0,
    payOuts: 0,
    drops: 0,
    expected: 103200,
    counted: 103000,
    variance: -200,
  },
  ...partial,
});

const withCount = () => {
  const base = report();
  return report({
    day: {
      ...base.day,
      closeCount: {
        notes: { '500': 3, '200': 0, '100': 2, '50': 0, '20': 0, '10': 0 },
        coins: 3000,
      },
      closeReasonCode: 'COUNT_ERROR',
      closeNote: 'Recounted twice',
    },
  });
};

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
    collected: 41000,
    unpaid: 0,
  },
];

function as(permissions: Permission[], role: 'OWNER' | 'MANAGER' | 'CASHIER' = 'MANAGER') {
  useSession.getState().setSession(sessionBody(role, permissions));
}

const MOVEMENTS = {
  totals: { payIn: 50000, payOut: 20000, drop: 30000 },
  list: [
    {
      at: '2026-10-06T05:30:00Z',
      type: 'PAY_IN',
      amount: 50000,
      reasonCode: 'FLOAT_TOP_UP',
      note: null,
      by: 'Kavya',
    },
    {
      at: '2026-10-06T07:00:00Z',
      type: 'PAY_OUT',
      amount: 20000,
      reasonCode: 'OTHER',
      note: 'Gas refill',
      by: 'Meena',
    },
    {
      at: '2026-10-06T09:00:00Z',
      type: 'DROP',
      amount: 30000,
      reasonCode: 'SAFE',
      note: null,
      by: 'Meena',
    },
  ],
} satisfies DayReport['cashMovements'];

describe('Day close', () => {
  it('offers the Cash button while a day is open', async () => {
    as(MANAGER);
    mockApi({
      'GET /api/business-day/current': () => json(today),
      'GET /api/business-day': () => json([]),
      'GET /api/business-day/close-check': () => json(clear),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: 'Cash' }));
    expect(await screen.findByRole('dialog', { name: 'Cash in / out' })).toBeInTheDocument();
  });

  it('shows cash in and out on the day report, only when there was any', async () => {
    as(OWNER, 'OWNER');
    const base = report();
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () =>
        json({
          ...base,
          cashMovements: MOVEMENTS,
          cash: { ...base.cash, payIns: 50000, payOuts: 20000, drops: 30000, expected: 103200 },
        }),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    const block = within(shown).getByRole('heading', { name: 'Cash in / out' }).parentElement!;
    expect(within(block).getByText('Cash in')).toBeInTheDocument();
    expect(within(block).getByText('Cash out')).toBeInTheDocument();
    expect(within(block).getByText('Cash drops')).toBeInTheDocument();
    expect(within(block).getByText(/Kavya · Float top-up/)).toBeInTheDocument();
    expect(within(block).getByText(/Meena · Other: Gas refill/)).toBeInTheDocument();
    expect(within(block).getByText(/Meena · Moved to safe/)).toBeInTheDocument();
    // The drawer tally carries the same movements.
    expect(within(shown).getByText('Pay-ins')).toBeInTheDocument();
  });

  it('hides the cash in / out block when nothing moved', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(report()),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).queryByRole('heading', { name: 'Cash in / out' })).toBeNull();
    expect(within(shown).queryByText('Pay-ins')).toBeNull();
  });

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
            bills: [{ id: 'b1', orderId: 'o4', billNo: 12, due: 47300 }],
          },
        }),
    });
    renderRoute('/day');
    const open = await screen.findByRole('list', { name: 'Still open' });
    // Each line opens that order on the POS; an order and its unpaid bill are one line.
    expect(within(open).getByRole('link', { name: 'T1: order still open' })).toHaveAttribute(
      'href',
      '/pos?order=o1',
    );
    expect(
      within(open).getByRole('link', { name: 'Parcel #4: bill 12, ₹473 due' }),
    ).toHaveAttribute('href', '/pos?order=o4');
    expect(within(open).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();
    // Says which day is being closed, which matters when it was left open overnight.
    expect(screen.getByRole('heading', { name: 'Close the business day' })).toBeInTheDocument();
    expect(screen.getByText('Opened Tue, 6 Oct, 9:00 am by Meena')).toBeInTheDocument();
  });

  it('closes the day with the counted cash and shows the report', async () => {
    as(MANAGER);
    const mock = mockApi({
      'GET /api/business-day/current': () => json(today),
      'GET /api/business-day': () => json([]),
      'GET /api/business-day/close-check': () => json(clear),
      [CHECK]: () => json(checked, 201),
      'POST /api/business-day/close': () => json(report(), 201),
    });
    renderRoute('/day');
    await checkTotal('1030');
    expect(screen.getByText('₹1,032')).toBeInTheDocument();
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

  describe('blind count', () => {
    const closeBody = (mock: ReturnType<typeof mockApi>) =>
      JSON.parse(String(callsTo(mock, 'POST', '/api/business-day/close')[0]?.[1]?.body));

    const setup = (check: object = checked) =>
      mockApi({
        'GET /api/business-day/current': () => json(today),
        'GET /api/business-day': () => json([]),
        'GET /api/business-day/close-check': () => json(clear),
        [CHECK]: () => json(check, 201),
        'POST /api/business-day/close': () => json(report(), 201),
      });

    const countNotes = async () => {
      fireEvent.change(await screen.findByLabelText('₹500 notes'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('₹100 notes'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('Coins (₹)'), { target: { value: '30' } });
    };

    it('asks for the close check blind and hides the expected cash until checked', async () => {
      as(MANAGER);
      const mock = setup();
      renderRoute('/day');
      await countNotes();
      expect(callsTo(mock, 'GET', '/api/business-day/close-check')[0]?.[0]).toContain('blind=1');
      expect(screen.queryByText('Expected in drawer')).toBeNull();
      expect(screen.queryByText('Cash sales')).toBeNull();
      expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();
    });

    it('adds 3 × ₹500, 2 × ₹100 and ₹30 of coins up to ₹1,730', async () => {
      as(MANAGER);
      setup();
      renderRoute('/day');
      await countNotes();
      const total = screen.getByText('Counted total').parentElement!;
      expect(total).toHaveTextContent('₹1,730');
    });

    it('steps a note count up and down with + and −, never below zero', async () => {
      as(MANAGER);
      setup();
      renderRoute('/day');
      const fifty = await screen.findByLabelText('₹50 notes');
      fireEvent.click(screen.getByRole('button', { name: 'One more ₹50 note' }));
      fireEvent.click(screen.getByRole('button', { name: 'One more ₹50 note' }));
      expect(fifty).toHaveValue('2');
      fireEvent.click(screen.getByRole('button', { name: 'One less ₹50 note' }));
      fireEvent.click(screen.getByRole('button', { name: 'One less ₹50 note' }));
      fireEvent.click(screen.getByRole('button', { name: 'One less ₹50 note' }));
      expect(fifty).toHaveValue('0');
    });

    it('checks the count, then shows expected, counted and variance, and closes with the count', async () => {
      as(MANAGER);
      const mock = setup({ expected: 173000, variance: 0, needsReason: false });
      renderRoute('/day');
      await countNotes();
      fireEvent.click(screen.getByRole('button', { name: 'Check count' }));
      expect(await screen.findByText('Expected in drawer')).toBeInTheDocument();
      expect(
        JSON.parse(
          String(callsTo(mock, 'POST', '/api/business-day/d2/close/check-count')[0]?.[1]?.body),
        ),
      ).toEqual({ countedCash: 173000 });
      expect(screen.getByText('Variance')).toBeInTheDocument();
      expect(screen.queryByRole('radiogroup', { name: 'Reason' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Yes, close the day' }));
      await expect.poll(() => callsTo(mock, 'POST', '/api/business-day/close').length).toBe(1);
      expect(closeBody(mock)).toEqual({
        countedCash: 173000,
        count: {
          notes: { '500': 3, '200': 0, '100': 2, '50': 0, '20': 0, '10': 0 },
          coins: 3000,
        },
      });
    });

    it('needs a reason above the threshold before the day can close', async () => {
      as(MANAGER);
      const mock = setup({ expected: 103200, variance: 69800, needsReason: true });
      renderRoute('/day');
      await countNotes();
      fireEvent.click(screen.getByRole('button', { name: 'Check count' }));
      const reasons = await screen.findByRole('radiogroup', { name: 'Reason' });
      expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();
      fireEvent.click(within(reasons).getByRole('radio', { name: 'Other' }));
      // "Other" needs a few words too.
      expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();
      fireEvent.click(within(reasons).getByRole('radio', { name: 'Counting error' }));
      expect(screen.getByRole('button', { name: 'Close day' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Yes, close the day' }));
      await expect.poll(() => callsTo(mock, 'POST', '/api/business-day/close').length).toBe(1);
      expect(closeBody(mock)).toMatchObject({ countedCash: 173000, reasonCode: 'COUNT_ERROR' });
    });

    it('starts the check over when the server refuses the close', async () => {
      as(MANAGER);
      const mock = mockApi({
        'GET /api/business-day/current': () => json(today),
        'GET /api/business-day': () => json([]),
        'GET /api/business-day/close-check': () => json(clear),
        [CHECK]: () => json(checked, 201),
        'POST /api/business-day/close': () =>
          json({ code: 'REASON_REQUIRED', message: 'Say why.' }, 400),
      });
      renderRoute('/day');
      await countNotes();
      fireEvent.click(screen.getByRole('button', { name: 'Check count' }));
      await screen.findByText('Expected in drawer');
      fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Yes, close the day' }));
      await expect.poll(() => callsTo(mock, 'POST', '/api/business-day/close').length).toBe(1);
      await screen.findByRole('button', { name: 'Check count' });
      expect(screen.queryByText('Expected in drawer')).toBeNull();
      expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();
    });

    it('uses the reason note as the note when Other is chosen, without a second note box', async () => {
      as(MANAGER);
      const mock = setup({ expected: 103200, variance: 69800, needsReason: true });
      renderRoute('/day');
      await countNotes();
      expect(screen.getByLabelText('Note')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Check count' }));
      const reasons = await screen.findByRole('radiogroup', { name: 'Reason' });
      fireEvent.click(within(reasons).getByRole('radio', { name: 'Other' }));
      expect(screen.queryByLabelText('Note')).toBeNull();
      fireEvent.change(screen.getByLabelText('What happened'), { target: { value: 'Tip jar' } });
      fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Yes, close the day' }));
      await expect.poll(() => callsTo(mock, 'POST', '/api/business-day/close').length).toBe(1);
      expect(closeBody(mock)).toMatchObject({ reasonCode: 'OTHER', note: 'Tip jar' });
    });

    it('asks to check again when the count changes after a check', async () => {
      as(MANAGER);
      setup();
      renderRoute('/day');
      await countNotes();
      fireEvent.click(screen.getByRole('button', { name: 'Check count' }));
      await screen.findByText('Expected in drawer');
      fireEvent.change(screen.getByLabelText('₹500 notes'), { target: { value: '4' } });
      expect(screen.queryByText('Expected in drawer')).toBeNull();
      expect(screen.getByRole('button', { name: 'Close day' })).toBeDisabled();
    });
  });

  it('shows what blocked the close when the server refuses', async () => {
    as(MANAGER);
    mockApi({
      'GET /api/business-day/current': () => json(today),
      'GET /api/business-day': () => json([]),
      'GET /api/business-day/close-check': () => json(clear),
      [CHECK]: () => json(checked, 201),
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
    await checkTotal('1032');
    fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, close the day' }));
    const open = await screen.findByRole('list', { name: 'Still open' });
    expect(within(open).getByRole('link', { name: 'T9: order still open' })).toBeInTheDocument();
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
        [CHECK]: () => json(checked, 201),
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
      await checkTotal('1032');
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
  }, 40_000);

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
    // Sales total and, all of it paid, collected.
    expect(within(shown).getAllByText('₹410')).toHaveLength(2);
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

  it('breaks GST down by rate on the day report, with No-GST sales apart', async () => {
    as(OWNER, 'OWNER');
    const base = report();
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () =>
        json({ ...base, sales: { ...base.sales, exempt: 3000 } }),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const gst = await screen.findByRole('table', { name: 'GST by rate' });
    expect(within(gst).getByRole('row', { name: /5%.*₹390.*₹9.75.*₹9.75/ })).toBeInTheDocument();
    expect(within(gst).getByRole('row', { name: /No GST sales.*₹30/ })).toBeInTheDocument();
  });

  it('shows collected beside sales, and unpaid when bills are unpaid', async () => {
    as(OWNER, 'OWNER');
    const base = report();
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json([{ ...days[0]!, collected: 30000, unpaid: 11000 }]),
      'GET /api/business-day/d2/report': () =>
        json({ ...base, sales: { ...base.sales, collected: 30000, unpaid: 11000 } }),
    });
    renderRoute('/day');
    const row = await screen.findByRole('button', { name: /^6 Oct/ });
    expect(row).toHaveTextContent('Unpaid ₹110');
    fireEvent.click(row);
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).getByText('Collected')).toBeInTheDocument();
    expect(within(shown).getByText('Unpaid')).toBeInTheDocument();
    expect(within(shown).getByText('₹110')).toBeInTheDocument();
  });

  it('shows refunds, per mode, with the refunded bills on the day report', async () => {
    as(OWNER, 'OWNER');
    const base = report();
    const refunded = {
      ...base,
      refunds: {
        total: 50000,
        CASH: 20000,
        UPI: 30000,
        CARD: 0,
        bills: [{ billNo: 7, amount: 50000, modes: ['CASH', 'UPI'], by: 'Meena' }],
      },
      cash: { ...base.cash, cashRefunds: 20000 },
    };
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(refunded),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    const block = within(shown).getByRole('heading', { name: 'Refunds' }).parentElement!;
    expect(within(block).getByText('Total refunded')).toBeInTheDocument();
    expect(within(block).getAllByText('₹500')).toHaveLength(2);
    expect(within(block).getByText(/Bill 7 · Cash, UPI · Meena/)).toBeInTheDocument();
    expect(within(shown).getByText('Cash refunded')).toBeInTheDocument();
    // No refunds, no block.
  });

  it('shows how many times a bill was reprinted, only when it was', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () =>
        json({ ...report(), reprints: [{ billNo: 12, count: 2 }] }),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).getByText('Bill 12')).toBeInTheDocument();
    expect(within(shown).getByText('Reprinted 2×')).toBeInTheDocument();
  });

  it('hides the reprints block when nothing was reprinted', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(report()),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).queryByText(/Reprinted/)).toBeNull();
  });

  it('hides the refunds block when nothing was refunded', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(report()),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).queryByRole('heading', { name: 'Refunds' })).toBeNull();
    expect(within(shown).queryByText('Cash refunded')).toBeNull();
  });

  it('says the day was reopened, and what the earlier close was', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () =>
        json(
          report({
            reopened: {
              by: 'Priya',
              at: '2026-10-07T04:30:00Z',
              reason: 'Missed a bill',
              earlier: {
                closedAt: '2026-10-06T17:30:00Z',
                closedBy: 'Meena',
                counted: 99000,
                expected: 100000,
                variance: -1000,
              },
            },
          }),
        ),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    const note = within(shown).getByText(/Reopened by Priya/);
    expect(note).toHaveTextContent('Wed, 7 Oct, 10:00 am');
    expect(note).toHaveTextContent('earlier close: counted ₹990, variance −₹10');
  });

  it('shows the note count and the variance reason on the day report', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(withCount()),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    const block = within(shown).getByRole('heading', { name: 'Cash count' }).parentElement!;
    expect(within(block).getByText('₹500 × 3')).toBeInTheDocument();
    expect(within(block).getByText('₹1,500')).toBeInTheDocument();
    expect(within(block).getByText('₹100 × 2')).toBeInTheDocument();
    expect(within(block).getByText('Coins')).toBeInTheDocument();
    expect(within(block).queryByText(/₹200 ×/)).toBeNull();
    expect(within(block).getByText('Counting error')).toBeInTheDocument();
  });

  it('shows the first count when it differs from the closing count', async () => {
    as(OWNER, 'OWNER');
    const base = withCount();
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () =>
        json({ ...base, day: { ...base.day, firstCount: 120000 } }),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).getByText('First count')).toBeInTheDocument();
    expect(within(shown).getByText('₹1,200', { selector: '.tabular-nums' })).toBeInTheDocument();
  });

  it('has no cash count block for a day closed with a typed total', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(report()),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).queryByRole('heading', { name: 'Cash count' })).toBeNull();
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

describe('day report times on a PC set to UTC', () => {
  withDeviceTimeZone('UTC');

  it('prints opened and closed in India time', () => {
    const base = report();
    const html = renderDayReport(
      report({
        day: { ...base.day, openedAt: '2026-10-10T05:30:00Z', closedAt: '2026-10-10T19:00:00Z' },
      }),
      'Spice Garden',
    );
    expect(html).toMatch(/10 Oct 2026, 11:00.?am/i);
    expect(html).toMatch(/11 Oct 2026, 12:30.?am/i);
  });
});

const RECONCILIATION = {
  upi: { withRef: 3, withoutRef: 2, amountWithout: 12000 },
  card: { withRef: 1, withoutRef: 0, amountWithout: 0 },
  missing: [
    { billNo: 7, mode: 'UPI' as const, amount: 5000, at: '2026-10-06T08:00:00Z' },
    { billNo: 9, mode: 'UPI' as const, amount: 7000, at: '2026-10-06T09:00:00Z' },
  ],
};

describe('payment reconciliation', () => {
  it('lists UPI and card payments with and without a reference on the day report', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () =>
        json({ ...report(), reconciliation: RECONCILIATION }),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    const block = within(shown).getByRole('heading', {
      name: 'UPI and card references',
    }).parentElement!;
    expect(within(block).getByText('UPI · 3 with reference, 2 without')).toBeInTheDocument();
    expect(within(block).getByText('Card · 1 with reference, 0 without')).toBeInTheDocument();
    expect(within(block).getByText('Bill 7 · UPI')).toBeInTheDocument();
    expect(within(block).getByText('Bill 9 · UPI')).toBeInTheDocument();
    expect(within(block).getByText('₹120')).toBeInTheDocument();
  });

  it('is left out when there were no UPI or card payments', async () => {
    as(OWNER, 'OWNER');
    mockApi({
      'GET /api/business-day/current': () => json({ day: null }),
      'GET /api/business-day': () => json(days),
      'GET /api/business-day/d2/report': () => json(report()),
    });
    renderRoute('/day');
    fireEvent.click(await screen.findByRole('button', { name: /^6 Oct/ }));
    const shown = await screen.findByRole('region', { name: 'Day report' });
    expect(within(shown).queryByRole('heading', { name: 'UPI and card references' })).toBeNull();
  });

  it('prints the same figures', () => {
    const html = renderDayReport(report({ reconciliation: RECONCILIATION }), 'Spice Garden');
    expect(html).toContain('UPI and card references');
    expect(html).toContain('3 with reference, 2 without');
    expect(html).toContain('Bill 7 · UPI');
    expect(renderDayReport(report(), 'Spice Garden')).not.toContain('UPI and card references');
  });
});

describe('renderDayReport', () => {
  it('prints cash in and out with its list, only when there was any', () => {
    const base = report();
    const html = renderDayReport(
      report({
        cashMovements: MOVEMENTS,
        cash: { ...base.cash, payIns: 50000, payOuts: 20000, drops: 30000 },
      }),
      'Spice Garden',
    );
    expect(html).toContain('Cash in / out');
    expect(html).toContain('Gas refill');
    expect(html).toContain('Moved to safe');
    expect(html).toContain('Pay-ins');
    expect(html).toContain('Drops');
    expect(renderDayReport(report(), 'Spice Garden')).not.toContain('Cash in / out');
    expect(renderDayReport(report(), 'Spice Garden')).not.toContain('Pay-ins');
  });

  it('prints the note count and the variance reason', () => {
    const html = renderDayReport(withCount(), 'Spice Garden');
    expect(html).toContain('Cash count');
    expect(html).toContain('₹500 × 3');
    expect(html).toContain('₹1,500');
    expect(html).toContain('Coins');
    expect(html).toContain('Reason');
    expect(html).toContain('Counting error');
    expect(renderDayReport(report(), 'Spice Garden')).not.toContain('Cash count');
    expect(html).not.toContain('First count');
    const base = withCount();
    const first = renderDayReport(
      { ...base, day: { ...base.day, firstCount: 120000 } },
      'Spice Garden',
    );
    expect(first).toContain('First count');
  });

  it('prints who reopened the day and the earlier close', () => {
    const html = renderDayReport(
      report({
        reopened: {
          by: 'Priya',
          at: '2026-10-07T04:30:00Z',
          reason: 'Missed a bill',
          earlier: {
            closedAt: '2026-10-06T17:30:00Z',
            closedBy: 'Meena',
            counted: 99000,
            expected: 100000,
            variance: -1000,
          },
        },
      }),
      'Spice Garden',
    );
    expect(html).toContain('Reopened by Priya');
    expect(html).toContain('counted ₹990.00');
    expect(renderDayReport(report(), 'Spice Garden')).not.toContain('Reopened');
  });

  it('prints the reprinted bills, only when there are any', () => {
    const html = renderDayReport(report({ reprints: [{ billNo: 135, count: 2 }] }), 'Spice Garden');
    expect(html).toContain('Reprinted bills');
    expect(html).toContain('Bill 135');
    expect(html).toContain('reprinted 2×');
    expect(renderDayReport(report(), 'Spice Garden')).not.toContain('Reprinted bills');
  });

  it('prints the refunds, per mode, and the cash refunded in the drawer tally', () => {
    const base = report();
    const html = renderDayReport(
      report({
        refunds: {
          total: 50000,
          CASH: 20000,
          UPI: 30000,
          CARD: 0,
          bills: [{ billNo: 7, amount: 50000, modes: ['CASH', 'UPI'], by: 'Meena' }],
        },
        cash: { ...base.cash, cashRefunds: 20000 },
      }),
      'Spice Garden',
    );
    expect(html).toContain('Refunds');
    expect(html).toContain('Bill 7');
    expect(html).toContain('Cash refunded');
    expect(renderDayReport(report(), 'Spice Garden')).not.toContain('Refunds');
  });

  it('prints collected and unpaid under the total', () => {
    const base = report();
    const html = renderDayReport(
      report({ sales: { ...base.sales, collected: 30000, unpaid: 11000 } }),
      'Spice Garden',
    );
    expect(html).toContain('Collected');
    expect(html).toContain('Unpaid');
    expect(renderDayReport(report(), 'Spice Garden')).not.toContain('Unpaid');
  });

  it('prints GST by rate and the No-GST sales', () => {
    const base = report();
    const html = renderDayReport(
      report({ sales: { ...base.sales, exempt: 3000 } }),
      'Spice Garden',
    );
    expect(html).toContain('GST 5% on ₹390');
    expect(html).toContain('No GST sales');
    expect(html).toContain('₹30');
  });

  it('prints the cash tally and escapes text', () => {
    const html = renderDayReport(
      report({ day: { ...report().day, closeNote: '<b>short</b>' } }),
      'Spice Garden',
    );
    expect(html).toContain('Expected in drawer');
    expect(html).not.toContain('No GST sales');
    expect(html).toContain('Spice Garden');
    expect(html).toContain('&lt;b&gt;short');
    expect(html).not.toContain('<b>short');
  });
});
