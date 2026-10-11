import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { renderWithProviders } from '@/test/render';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { CashButton } from '../index';

const CASHIER: Permission[] = ['payment.take', 'bill.print', 'expense.manage'];
const MANAGER: Permission[] = [...CASHIER, 'day.openClose'];

function as(role: 'CASHIER' | 'MANAGER' | 'WAITER', permissions: Permission[]) {
  useSession.getState().setSession(sessionBody(role, permissions));
}

const created = (over: object = {}) => ({
  id: 'c1',
  businessDayId: 'd1',
  type: 'PAY_IN',
  amount: 50000,
  reasonCode: 'FLOAT_TOP_UP',
  note: null,
  createdBy: { id: 'u', name: 'Kavya' },
  approvedBy: null,
  createdAt: '2026-10-11T05:30:00Z',
  ...over,
});

// Radix tabs switch on mouse down.
const openTab = (tab: HTMLElement) => fireEvent.mouseDown(tab, { button: 0 });

async function openDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cash' }));
  return screen.findByRole('dialog', { name: 'Cash in / out' });
}

describe('CashDialog', () => {
  it('shows the Cash button only to people who take payments or close the day', () => {
    as('WAITER', ['order.take']);
    const { unmount } = renderWithProviders(<CashButton />);
    expect(screen.queryByRole('button', { name: 'Cash' })).toBeNull();
    unmount();
    as('CASHIER', CASHIER);
    renderWithProviders(<CashButton />);
    expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument();
  });

  it('records cash in with a reason, in paise', async () => {
    as('CASHIER', CASHIER);
    const mock = mockApi({ 'POST /api/cash-movements': () => json(created(), 201) });
    renderWithProviders(<CashButton />);
    const dialog = await openDialog();
    expect(
      within(dialog)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Cash in', 'Cash out', 'Cash drop']);
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '500' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Float top-up' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record cash in' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/cash-movements').length).toBe(1);
    const call = callsTo(mock, 'POST', '/api/cash-movements')[0]![1]!;
    expect(JSON.parse(call.body as string)).toEqual({
      type: 'PAY_IN',
      amount: 50000,
      reasonCode: 'FLOAT_TOP_UP',
    });
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
  });

  it('asks for a reason, an amount, and a note for Other', async () => {
    as('MANAGER', MANAGER);
    const mock = mockApi({ 'POST /api/cash-movements': () => json(created(), 201) });
    renderWithProviders(<CashButton />);
    const dialog = await openDialog();
    openTab(within(dialog).getByRole('tab', { name: 'Cash out' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record cash out' }));
    expect(
      await within(dialog).findByText('Enter the amount in rupees, like 450'),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '120' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record cash out' }));
    expect(await within(dialog).findByText('Choose a reason.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Other' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record cash out' }));
    expect(await within(dialog).findByText('Say what happened.')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/cash-movements')).toHaveLength(0);
  });

  it('lets a manager pay out and drop without a PIN step', async () => {
    as('MANAGER', MANAGER);
    const mock = mockApi({
      'POST /api/cash-movements': () => json(created({ type: 'DROP', amount: 300000 }), 201),
    });
    renderWithProviders(<CashButton />);
    const dialog = await openDialog();
    openTab(within(dialog).getByRole('tab', { name: 'Cash drop' }));
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '3000' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Taken to bank' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record cash drop' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/cash-movements').length).toBe(1);
    const body = JSON.parse(callsTo(mock, 'POST', '/api/cash-movements')[0]![1]!.body as string);
    expect(body).toEqual({ type: 'DROP', amount: 300000, reasonCode: 'BANK' });
    expect(screen.queryByRole('form', { name: 'Manager approval' })).toBeNull();
  });

  it('asks a manager to approve a cashier pay-out, then sends their approval', async () => {
    as('CASHIER', CASHIER);
    let attempt = 0;
    const mock = mockApi({
      'GET /api/auth/approvers': () => json([{ id: 'm1', name: 'Meena' }]),
      'POST /api/auth/override': () => json({ overrideToken: 'tok' }, 201),
      'POST /api/cash-movements': () => {
        attempt += 1;
        return attempt === 1
          ? json({ code: 'APPROVAL_REQUIRED', message: 'A manager must approve.' }, 403)
          : json(created({ type: 'PAY_OUT', approvedBy: { id: 'm1', name: 'Meena' } }), 201);
      },
    });
    renderWithProviders(<CashButton />);
    const dialog = await openDialog();
    openTab(within(dialog).getByRole('tab', { name: 'Cash out' }));
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '200' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Supplier paid' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record cash out' }));
    const approval = await within(dialog).findByRole('form', { name: 'Manager approval' });
    await within(approval).findByRole('option', { name: 'Meena' });
    fireEvent.change(within(approval).getByLabelText('Manager'), { target: { value: 'm1' } });
    fireEvent.change(within(approval).getByLabelText('Manager PIN'), { target: { value: '9999' } });
    fireEvent.click(within(approval).getByRole('button', { name: 'Approve' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/cash-movements').length).toBe(2);
    const second = JSON.parse(callsTo(mock, 'POST', '/api/cash-movements')[1]![1]!.body as string);
    expect(second).toEqual({
      type: 'PAY_OUT',
      amount: 20000,
      reasonCode: 'SUPPLIER',
      overrideToken: 'tok',
    });
    await expect.poll(() => screen.queryByRole('dialog')).toBeNull();
  });
});
