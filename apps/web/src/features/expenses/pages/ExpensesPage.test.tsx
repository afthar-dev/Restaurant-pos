import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderDayReport } from '@/features/day/dayReport';
import type { DayReport } from '@/features/day/types';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderRoute } from '@/test/render';
import type { DayExpenses, Expense } from '../types';

const GAS = '11111111-1111-4111-8111-111111111111';

const CATEGORIES = [
  { id: 'raw', name: 'Raw material', isSystem: true },
  { id: GAS, name: 'Gas', isSystem: false },
];

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  businessDayId: 'd1',
  amount: 95000,
  mode: 'CASH',
  note: 'Cylinder',
  source: 'MANUAL',
  purchaseId: null,
  category: { id: GAS, name: 'Gas' },
  createdBy: { id: 'u', name: 'Ravi' },
  createdAt: '2026-10-07T05:30:00Z',
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  ...over,
});

const day = (expenses: Expense[] = []): DayExpenses => ({
  day: { id: 'd1', status: 'OPEN', openedAt: '2026-10-07T03:30:00Z' },
  expenses,
  totals: {
    total: expenses.filter((e) => !e.voidedAt).reduce((n, e) => n + e.amount, 0),
    cash: 0,
    byMode: { CASH: 0, UPI: 0, CARD: 0 },
    byCategory: [],
  },
});

function asCashier() {
  useSession.getState().setSession(sessionBody('CASHIER', ['expense.manage', 'bill.print']));
}

describe('ExpensesPage', () => {
  it('saves an expense in paise and reuses the request id after a network failure', async () => {
    asCashier();
    let attempt = 0;
    const mock = mockApi({
      'GET /api/expenses': () => json(day()),
      'GET /api/expense-categories': () => json(CATEGORIES),
      'POST /api/expenses': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return json(expense(), 201);
      },
    });
    renderRoute('/expenses');
    const form = await screen.findByRole('form', { name: 'New expense' });
    await within(form).findByRole('option', { name: 'Gas' });
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: GAS } });
    fireEvent.change(within(form).getByLabelText('Amount (₹)'), { target: { value: '950' } });
    fireEvent.click(within(form).getByLabelText('UPI'));
    fireEvent.change(within(form).getByLabelText('Note (optional)'), {
      target: { value: 'Cylinder' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save expense' }));
    expect(await within(form).findByRole('alert')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Save expense' }));
    expect(await within(form).findByText('Expense saved.')).toBeInTheDocument();
    const sent = callsTo(mock, 'POST', '/api/expenses');
    expect(sent).toHaveLength(2);
    const key = (i: number) => new Headers(sent[i]?.[1]?.headers).get('Idempotency-Key');
    expect(key(0)).toBe(key(1));
    expect(JSON.parse(String(sent[1]?.[1]?.body))).toEqual({
      categoryId: GAS,
      amount: 95000,
      mode: 'UPI',
      note: 'Cylinder',
    });
  });

  it('asks for a category and a valid amount', async () => {
    asCashier();
    const mock = mockApi({
      'GET /api/expenses': () => json(day()),
      'GET /api/expense-categories': () => json(CATEGORIES),
    });
    renderRoute('/expenses');
    const form = await screen.findByRole('form', { name: 'New expense' });
    fireEvent.change(within(form).getByLabelText('Amount (₹)'), { target: { value: 'abc' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save expense' }));
    expect(await within(form).findByText('Enter the amount in rupees, like 450')).toBeVisible();
    fireEvent.change(within(form).getByLabelText('Amount (₹)'), { target: { value: '100' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save expense' }));
    expect(await within(form).findByText('Choose a category')).toBeVisible();
    expect(callsTo(mock, 'POST', '/api/expenses')).toHaveLength(0);
  });

  it('lists the day with totals, voided rows struck through, and voids with a reason', async () => {
    asCashier();
    const mock = mockApi({
      'GET /api/expenses': () =>
        json(
          day([
            expense(),
            expense({
              id: 'e2',
              amount: 700,
              note: null,
              voidedAt: '2026-10-07T06:00:00Z',
              voidReason: 'Entered twice',
            }),
          ]),
        ),
      'GET /api/expense-categories': () => json(CATEGORIES),
      'POST /api/expenses/e1/void': () => json(expense({ voidedAt: 'x' }), 201),
    });
    renderRoute('/expenses');
    const list = await screen.findByRole('region', { name: "Today's expenses" });
    expect(await within(list).findByText('Voided: Entered twice')).toBeInTheDocument();
    expect(within(list).getAllByRole('button', { name: /^Void/ })).toHaveLength(1);
    fireEvent.click(within(list).getByRole('button', { name: 'Void Gas ₹950' }));
    const confirm = within(list).getByRole('button', { name: 'Void expense' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(list).getByLabelText('Why void this expense?'), {
      target: { value: 'Wrong amount' },
    });
    fireEvent.click(confirm);
    await expect.poll(() => callsTo(mock, 'POST', '/api/expenses/e1/void').length).toBe(1);
    expect(
      JSON.parse(String(callsTo(mock, 'POST', '/api/expenses/e1/void')[0]?.[1]?.body)),
    ).toEqual({ reason: 'Wrong amount' });
  });

  it('keeps Raw material out of reach in the categories sheet', async () => {
    asCashier();
    mockApi({
      'GET /api/expenses': () => json(day()),
      'GET /api/expense-categories': () => json(CATEGORIES),
    });
    renderRoute('/expenses');
    fireEvent.click(await screen.findByRole('button', { name: 'Categories' }));
    const sheet = await screen.findByRole('dialog', { name: 'Expense categories' });
    expect(await within(sheet).findByText('Used by purchases')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Rename Raw material' })).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Rename Gas' })).toBeInTheDocument();
  });

  it('asks to open the business day first', async () => {
    asCashier();
    mockApi({
      'GET /api/expenses': () => json({ ...day(), day: null }),
      'GET /api/expense-categories': () => json(CATEGORIES),
    });
    renderRoute('/expenses');
    expect(await screen.findByText(/Open the business day first/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New expense' })).toBeNull();
  });
});

describe('day report printout', () => {
  it('lists expenses by category', () => {
    const report = {
      day: {
        id: 'd',
        status: 'CLOSED',
        openedAt: '2026-10-07T03:30:00Z',
        closedAt: '2026-10-07T17:30:00Z',
        openedBy: { id: 'a', name: 'A' },
        closedBy: { id: 'a', name: 'A' },
        closeNote: null,
      },
      sales: {
        bills: 0,
        grossSubtotal: 0,
        discounts: 0,
        packaging: 0,
        taxable: 0,
        exempt: 0,
        gstBreakup: [],
        cgst: 0,
        sgst: 0,
        roundOff: 0,
        total: 0,
      },
      payments: { CASH: 0, UPI: 0, CARD: 0 },
      byType: { DINE_IN: { orders: 0, total: 0 }, PARCEL: { orders: 0, total: 0 } },
      topItems: [],
      voids: [],
      cancels: [],
      discounts: [],
      expenses: { total: 95000, cash: 95000, byCategory: [{ name: 'Gas <LPG>', amount: 95000 }] },
      cash: {
        opening: 0,
        cashSales: 0,
        cashExpenses: 95000,
        expected: -95000,
        counted: null,
        variance: null,
      },
    } satisfies DayReport;
    const html = renderDayReport(report, 'Spice Garden');
    expect(html).toContain('Expenses');
    expect(html).toContain('Gas &lt;LPG&gt;');
  });
});
