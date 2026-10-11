import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { bill } from '@/test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import type { Bill } from '../types';
import { BillView } from './BillView';

const CASHIER: Permission[] = ['bill.print', 'payment.take'];
const PAYMENT = {
  id: 'p1',
  mode: 'CASH' as const,
  amount: 47300,
  tendered: null,
  change: null,
  reference: null,
  receivedBy: { id: 'u1', name: 'Kavya' },
  createdAt: '2026-10-06T14:12:00.000Z',
};
const paid = (partial: Partial<Bill> = {}) =>
  bill({ status: 'PAID', paid: 47300, due: 0, payments: [PAYMENT], ...partial });
const changeCalls = (mock: ReturnType<typeof mockApi>) =>
  callsTo(mock, 'POST', '/api/payments/p1/change-mode');
const sentBody = (mock: ReturnType<typeof mockApi>, i: number) =>
  JSON.parse(String(changeCalls(mock)[i]![1]!.body));

function asCashier(permissions: Permission[] = CASHIER) {
  useSession.getState().setSession(sessionBody('CASHIER', permissions));
}

function fill(dialog: HTMLElement, mode = 'UPI') {
  fireEvent.click(within(dialog).getByRole('button', { name: mode }));
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Wrong payment mode' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Change mode' }));
}

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Change mode of the Cash payment' }));
  return screen.findByRole('dialog', { name: 'Change payment mode' });
}

async function approve(dialog: HTMLElement) {
  const approval = await within(dialog).findByRole('form', { name: 'Manager approval' });
  await within(approval).findByRole('option', { name: 'Meena' });
  fireEvent.change(within(approval).getByLabelText('Manager'), { target: { value: 'm1' } });
  fireEvent.change(within(approval).getByLabelText('Manager PIN'), { target: { value: '9999' } });
  fireEvent.click(within(approval).getByRole('button', { name: 'Approve' }));
}

const approvers = {
  'GET /api/auth/approvers': () => json([{ id: 'm1', name: 'Meena' }]),
  'POST /api/auth/override': () => json({ overrideToken: 'tok' }, 201),
};

describe('changing a payment mode', () => {
  it('offers Change mode on a paid bill only, to someone who takes payments', () => {
    asCashier();
    mockApi({});
    const view = renderWithProviders(<BillView bill={paid()} />);
    expect(
      screen.getByRole('button', { name: 'Change mode of the Cash payment' }),
    ).toBeInTheDocument();
    view.unmount();

    renderWithProviders(<BillView bill={bill()} />);
    expect(screen.queryByRole('button', { name: /Change mode/ })).toBeNull();
  });

  it('hides it from someone who cannot take payments', () => {
    asCashier(['bill.print']);
    mockApi({});
    renderWithProviders(<BillView bill={paid()} />);
    expect(screen.queryByRole('button', { name: /Change mode/ })).toBeNull();
  });

  it('asks a manager for a PIN when the API says so, then retries with the token', async () => {
    asCashier();
    let attempt = 0;
    const mock = mockApi({
      ...approvers,
      'POST /api/payments/p1/change-mode': () => {
        attempt += 1;
        return attempt === 1
          ? json({ code: 'APPROVAL_REQUIRED', message: 'A manager must approve.' }, 403)
          : json(paid({ payments: [{ ...PAYMENT, mode: 'UPI' }] }), 201);
      },
    });
    renderWithProviders(<BillView bill={paid()} />);
    const dialog = await openDialog();
    fill(dialog);
    await approve(dialog);
    await expect.poll(() => changeCalls(mock).length).toBe(2);
    expect(sentBody(mock, 0)).toEqual({ mode: 'UPI', reasonCode: 'WRONG_MODE' });
    expect(sentBody(mock, 1)).toEqual({
      mode: 'UPI',
      reasonCode: 'WRONG_MODE',
      overrideToken: 'tok',
    });
    await expect
      .poll(() => screen.queryByRole('dialog', { name: 'Change payment mode' }))
      .toBeNull();
  });

  it('asks again when the token did not work', async () => {
    asCashier();
    mockApi({
      ...approvers,
      'POST /api/payments/p1/change-mode': () =>
        json({ code: 'APPROVAL_REQUIRED', message: 'A manager must approve.' }, 403),
    });
    renderWithProviders(<BillView bill={paid()} />);
    const dialog = await openDialog();
    fill(dialog);
    await approve(dialog);
    expect(
      await within(dialog).findByText('That approval did not work. Ask the manager again.'),
    ).toBeInTheDocument();
  });

  it('shows a closed-day refusal in the dialog', async () => {
    asCashier();
    mockApi({
      'POST /api/payments/p1/change-mode': () =>
        json({ code: 'DAY_CLOSED', message: 'This payment belongs to a closed day.' }, 409),
    });
    renderWithProviders(<BillView bill={paid()} />);
    const dialog = await openDialog();
    fill(dialog, 'Card');
    expect(await within(dialog).findByText(/closed day/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('form', { name: 'Manager approval' })).toBeNull();
  });

  it('needs a mode and a reason before it sends anything', async () => {
    asCashier();
    const mock = mockApi({});
    renderWithProviders(<BillView bill={paid()} />);
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change mode' }));
    expect(await within(dialog).findByText('Choose the right mode.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'UPI' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change mode' }));
    expect(await within(dialog).findByText('Choose a reason.')).toBeInTheDocument();
    expect(changeCalls(mock)).toHaveLength(0);
  });
});
