import { fireEvent, screen } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { bill } from '@/test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import { SettlePanel } from './SettlePanel';

const STAFF: Permission[] = ['bill.print', 'payment.take'];
const PAID = () => json(bill({ status: 'PAID', paid: 47300, due: 0 }), 201);
const outlet = (extra = {}) => ({ id: 'o', upiVpa: null, upiPayee: null, ...extra });
const withUpi = {
  'GET /api/outlet': () =>
    json(outlet({ upiVpa: 'spicegarden@okicici', upiPayee: 'Spice Garden' })),
};

function setup(handlers = {}, role: 'CASHIER' | 'OWNER' = 'CASHIER') {
  useSession.getState().setSession(sessionBody(role, STAFF));
  const mock = mockApi(handlers);
  const onPaid = vi.fn();
  const view = renderWithProviders(<SettlePanel bill={bill()} onPaid={onPaid} onMore={vi.fn()} />);
  return { mock, onPaid, view };
}

const posts = (mock: ReturnType<typeof mockApi>) => callsTo(mock, 'POST', '/api/bills/b1/payments');
const sent = (mock: ReturnType<typeof mockApi>) => JSON.parse(String(posts(mock)[0]?.[1]?.body));

describe('SettlePanel UPI QR', () => {
  it('shows the QR with the amount when choosing UPI and a UPI ID is set', async () => {
    setup(withUpi);
    await expect.poll(() => screen.queryByText('Scan to pay ₹473')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    expect(await screen.findByRole('img', { name: 'UPI QR code' })).toBeInTheDocument();
    expect(screen.getByText('Scan to pay ₹473')).toBeInTheDocument();
  });

  it('shows no QR for Card', async () => {
    setup(withUpi);
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(screen.queryByText(/Scan to pay/)).toBeNull();
    expect(screen.queryByText('Add your UPI ID in Settings')).toBeNull();
  });

  it('tells the owner to add a UPI ID', async () => {
    setup({ 'GET /api/outlet': () => json(outlet()) }, 'OWNER');
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    expect(await screen.findByText('Add your UPI ID in Settings')).toBeInTheDocument();
  });

  it('does not tell a cashier, who cannot change settings', async () => {
    const { mock } = setup({ 'GET /api/outlet': () => json(outlet()) });
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    await expect.poll(() => callsTo(mock, 'GET', '/api/outlet').length).toBe(1);
    await screen.findByRole('button', { name: 'Confirm ₹473 by UPI' });
    expect(screen.queryByText('Add your UPI ID in Settings')).toBeNull();
    expect(screen.queryByText(/Scan to pay/)).toBeNull();
  });
});

describe('SettlePanel references', () => {
  it('sends the optional reference with a card payment', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    fireEvent.change(screen.getByLabelText('Reference (optional)'), {
      target: { value: ' AB12CD34 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by card' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'CARD', amount: 47300, reference: 'AB12CD34' });
  });

  it('leaves the reference out when blank', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'UPI', amount: 47300 });
  });

  it('has no reference field for cash, and refuses a bad reference', async () => {
    const { mock } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    expect(screen.queryByLabelText('Reference (optional)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.change(screen.getByLabelText('Reference (optional)'), { target: { value: 'ab-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    expect(
      await screen.findByText('A reference is 6 to 22 letters and digits'),
    ).toBeInTheDocument();
    expect(posts(mock)).toHaveLength(0);
  });
});
