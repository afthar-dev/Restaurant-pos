import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotifications } from '@/features/notifications';
import { useSession } from '@/shared/session/store';
import { bill, line, order } from '@/test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import { OrderWorkspace } from '@/features/service/components/OrderWorkspace';
import { PaymentSheet } from './PaymentSheet';

const CASHIER: Permission[] = ['order.take', 'bill.print', 'payment.take', 'discount.apply'];

function asCashier() {
  useSession.getState().setSession(sessionBody('CASHIER', CASHIER));
}

function body(mock: ReturnType<typeof mockApi>, index = 0) {
  return JSON.parse(String(callsTo(mock, 'POST', '/api/bills/b1/payments')[index]?.[1]?.body));
}

const keyOf = (mock: ReturnType<typeof mockApi>, index: number) =>
  new Headers(callsTo(mock, 'POST', '/api/bills/b1/payments')[index]?.[1]?.headers).get(
    'Idempotency-Key',
  );

afterEach(() => vi.unstubAllGlobals());

describe('PaymentSheet', () => {
  it('takes cash and shows the change', async () => {
    asCashier();
    const mock = mockApi({
      'POST /api/bills/b1/payments': () => json(bill({ status: 'PAID', paid: 47300, due: 0 }), 201),
    });
    const onPaid = vi.fn();
    renderWithProviders(<PaymentSheet bill={bill()} onPaid={onPaid} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Cash received (₹)'), { target: { value: '500' } });
    expect(screen.getByText('Change ₹27')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(body(mock)).toEqual({ mode: 'CASH', amount: 47300, tendered: 50000 });
    expect(keyOf(mock, 0)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('takes cash on a plain-http page where crypto.randomUUID is missing', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    asCashier();
    const mock = mockApi({
      'POST /api/bills/b1/payments': () => json(bill({ status: 'PAID', paid: 47300, due: 0 }), 201),
    });
    const onPaid = vi.fn();
    renderWithProviders(<PaymentSheet bill={bill()} onPaid={onPaid} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Cash received (₹)'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(keyOf(mock, 0)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not record short cash', async () => {
    asCashier();
    const mock = mockApi({});
    renderWithProviders(
      <PaymentSheet
        bill={bill({ total: 73200, due: 73200 })}
        onPaid={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Cash received (₹)'), { target: { value: '500' } });
    expect(screen.getByText('₹232 more needed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
    expect(callsTo(mock, 'POST', '/api/bills/b1/payments')).toHaveLength(0);
  });

  it('offers quick cash notes above the amount', async () => {
    asCashier();
    mockApi({});
    renderWithProviders(
      <PaymentSheet bill={bill()} onPaid={() => undefined} onClose={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '₹500' }));
    expect(screen.getByLabelText('Cash received (₹)')).toHaveValue('500');
    fireEvent.click(screen.getByRole('button', { name: 'Exact' }));
    expect(screen.getByLabelText('Cash received (₹)')).toHaveValue('473');
  });

  it('splits equally so the shares add up to the bill', async () => {
    asCashier();
    const mock = mockApi({
      'POST /api/bills/b1/payments': () => json(bill({ total: 10000, due: 6666, paid: 3334 }), 201),
    });
    renderWithProviders(
      <PaymentSheet
        bill={bill({ total: 10000, due: 10000 })}
        onPaid={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Split between'), { target: { value: '3' } });
    const shares = screen.getByRole('group', { name: 'Equal shares' });
    expect(
      within(shares)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['₹33.34', '₹33.33', '₹33.33']);
    fireEvent.click(within(shares).getAllByRole('button')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/bills/b1/payments').length).toBe(1);
    expect(body(mock)).toEqual({ mode: 'UPI', amount: 3334 });
  });

  it('records once on a double tap', async () => {
    asCashier();
    const mock = mockApi({
      'POST /api/bills/b1/payments': () => new Promise<Response>(() => undefined),
    });
    renderWithProviders(
      <PaymentSheet bill={bill()} onPaid={() => undefined} onClose={() => undefined} />,
    );
    const record = screen.getByRole('button', { name: 'Record payment' });
    fireEvent.click(record);
    fireEvent.click(record);
    await expect.poll(() => callsTo(mock, 'POST', '/api/bills/b1/payments').length).toBe(1);
  });

  it('does not record a part payment twice when the second tap lands after a fast reply', async () => {
    asCashier();
    const mock = mockApi({
      'POST /api/bills/b1/payments': () =>
        json(
          bill({
            total: 10000,
            due: 6666,
            paid: 3334,
            payments: [
              {
                id: 'p1',
                mode: 'UPI',
                amount: 3334,
                tendered: null,
                change: null,
                reference: null,
                receivedBy: { id: 'c', name: 'Kavya' },
                createdAt: '',
              },
            ],
          }),
          201,
        ),
    });
    // The bill shown is the one from before the payment; the refreshed one has not arrived.
    renderWithProviders(
      <PaymentSheet
        bill={bill({ total: 10000, due: 10000 })}
        onPaid={() => undefined}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.change(screen.getByLabelText('Amount (₹)'), { target: { value: '33.34' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/bills/b1/payments').length).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callsTo(mock, 'POST', '/api/bills/b1/payments')).toHaveLength(1);
    expect(screen.getByLabelText('Amount (₹)')).toHaveValue('66.66');
  });

  it('retries a failed payment with the same request id', async () => {
    asCashier();
    let attempt = 0;
    const mock = mockApi({
      'POST /api/bills/b1/payments': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return json(bill({ status: 'PAID', paid: 47300, due: 0 }), 201);
      },
    });
    renderWithProviders(
      <PaymentSheet bill={bill()} onPaid={() => undefined} onClose={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/bills/b1/payments').length).toBe(2);
    expect(keyOf(mock, 0)).toBe(keyOf(mock, 1));
  });

  it('sends a trimmed UPI reference and refuses more than is due', async () => {
    asCashier();
    const mock = mockApi({
      'POST /api/bills/b1/payments': () => json(bill({ status: 'PAID' }), 201),
    });
    renderWithProviders(
      <PaymentSheet bill={bill()} onPaid={() => undefined} onClose={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.change(screen.getByLabelText('Amount (₹)'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(await screen.findByText('Only ₹473 is due.')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/bills/b1/payments')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Amount (₹)'), { target: { value: '473' } });
    fireEvent.change(screen.getByLabelText('Reference (UTR or last 4 digits)'), {
      target: { value: ' UTR9 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/bills/b1/payments').length).toBe(1);
    expect(body(mock)).toEqual({ mode: 'UPI', amount: 47300, reference: 'UTR9' });
  });
});

describe('paying from the order screen', () => {
  it('takes the payment, says the table is free and returns to the floor', async () => {
    asCashier();
    let paid = false;
    const billed = order({
      status: 'BILLED',
      items: [line({ id: 'l2', status: 'SENT', kotId: 'k2', billedQuantity: 1 })],
      subtotal: 3000,
    });
    mockApi({
      'GET /api/orders/o1': () => json(paid ? { ...billed, status: 'CLOSED' } : billed),
      'GET /api/orders/o1/bills': () =>
        json([paid ? bill({ status: 'PAID', paid: 47300, due: 0 }) : bill()]),
      'POST /api/bills/b1/payments': () => {
        paid = true;
        return json(bill({ status: 'PAID', paid: 47300, due: 0 }), 201);
      },
    });
    const onClosed = vi.fn();
    renderWithProviders(<OrderWorkspace orderId="o1" layout="stack" onClosed={onClosed} />);
    fireEvent.click(await screen.findByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    expect(await screen.findByText('Bill 12 paid. T1 is free.')).toBeInTheDocument();
    // Also a toast, which stays in view wherever the counter has scrolled and after it closes.
    expect(useNotifications.getState().toasts.map((t) => t.text)).toContain(
      'Bill 12 paid. T1 is free.',
    );
    await expect.poll(() => onClosed.mock.calls.length, { timeout: 4000 }).toBe(1);
  });

  it('uses the full width for a billed order, which has no menu beside it', async () => {
    asCashier();
    const billed = order({
      status: 'BILLED',
      items: [line({ id: 'l2', status: 'SENT', kotId: 'k2', billedQuantity: 1 })],
    });
    mockApi({
      'GET /api/orders/o1': () => json(billed),
      'GET /api/orders/o1/bills': () => json([bill()]),
    });
    const { container } = renderWithProviders(
      <OrderWorkspace orderId="o1" layout="columns" onClosed={() => undefined} />,
    );
    await screen.findByRole('button', { name: 'UPI' });
    expect(container.firstElementChild?.className).not.toMatch(/grid-cols/);
  });

  it('does not offer payment to staff who cannot take it', async () => {
    useSession.getState().setSession(sessionBody('WAITER', ['order.take', 'bill.print']));
    const billed = order({
      status: 'BILLED',
      items: [line({ id: 'l2', status: 'SENT', kotId: 'k2', billedQuantity: 1 })],
    });
    mockApi({
      'GET /api/orders/o1': () => json(billed),
      'GET /api/orders/o1/bills': () => json([bill()]),
    });
    renderWithProviders(<OrderWorkspace orderId="o1" layout="stack" onClosed={() => undefined} />);
    await screen.findByRole('region', { name: 'Bill 12' });
    expect(screen.queryByRole('button', { name: 'UPI' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Split or part payment' })).toBeNull();
  });

  it('opens the full sheet for a part payment from the bill', async () => {
    asCashier();
    const billed = order({
      status: 'BILLED',
      items: [line({ id: 'l2', status: 'SENT', kotId: 'k2', billedQuantity: 1 })],
    });
    mockApi({
      'GET /api/orders/o1': () => json(billed),
      'GET /api/orders/o1/bills': () => json([bill()]),
    });
    renderWithProviders(<OrderWorkspace orderId="o1" layout="stack" onClosed={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Split or part payment' }));
    expect(await screen.findByRole('dialog', { name: 'Payment for bill 12' })).toBeInTheDocument();
  });

  it('bills a parcel and settles it on the same screen', async () => {
    asCashier();
    let billed = false;
    let paid = false;
    const parcel = order({
      type: 'PARCEL',
      table: null,
      tokenNo: 7,
      items: [line({ id: 'l2', status: 'SENT', kotId: 'k2' })],
    });
    const parcelBill = (partial = {}) =>
      bill({ orderType: 'PARCEL', tableName: null, tokenNo: 7, ...partial });
    mockApi({
      'GET /api/orders/o1': () =>
        json(
          paid
            ? { ...parcel, status: 'CLOSED' }
            : billed
              ? { ...parcel, status: 'BILLED' }
              : parcel,
        ),
      'GET /api/orders/o1/bills': () =>
        json(
          billed ? [paid ? parcelBill({ status: 'PAID', paid: 47300, due: 0 }) : parcelBill()] : [],
        ),
      'POST /api/orders/o1/bills': () => {
        billed = true;
        return json({ ...parcelBill(), printQueued: 1 }, 201);
      },
      'POST /api/bills/b1/payments': () => {
        paid = true;
        return json(parcelBill({ status: 'PAID', paid: 47300, due: 0 }), 201);
      },
    });
    const onClosed = vi.fn();
    renderWithProviders(<OrderWorkspace orderId="o1" layout="stack" onClosed={onClosed} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bill' }));
    expect(await screen.findByRole('button', { name: 'Cash' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    await expect.poll(() => onClosed.mock.calls.length, { timeout: 4000 }).toBe(1);
  });
});
