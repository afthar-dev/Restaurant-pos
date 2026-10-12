import { fireEvent, screen, within } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it } from 'vitest';
import { useSession } from '@/shared/session/store';
import { bill, line, order } from '@/test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import type { Order } from '@/features/orders/types';
import { BillArea } from './BillArea';

const CASHIER: Permission[] = [
  'order.take',
  'table.manage',
  'bill.print',
  'payment.take',
  'discount.apply',
];

function as(permissions: Permission[], role: 'CASHIER' | 'WAITER' | 'MANAGER' = 'CASHIER') {
  useSession.getState().setSession(sessionBody(role, permissions));
}

const sentOrder = (partial: Partial<Order> = {}) =>
  order({
    items: [
      line({
        id: 'l1',
        itemName: 'Paneer Tikka',
        variantName: 'Half',
        quantity: 2,
        status: 'SENT',
        kotId: 'k1',
        lineTotal: 42000,
      }),
      line({ id: 'l2', status: 'SENT', kotId: 'k2' }),
    ],
    subtotal: 45000,
    ...partial,
  });

function body(mock: ReturnType<typeof mockApi>, method: string, path: string, index = 0) {
  return JSON.parse(String(callsTo(mock, method, path)[index]?.[1]?.body));
}

function header(mock: ReturnType<typeof mockApi>, method: string, path: string, name: string) {
  return new Headers(callsTo(mock, method, path)[0]?.[1]?.headers).get(name);
}

describe('billing an order', () => {
  it('bills the order, prints it and shows the GST totals', async () => {
    as(CASHIER);
    let billed = false;
    const mock = mockApi({
      'GET /api/orders/o1/bills': () => json(billed ? [bill()] : []),
      'POST /api/orders/o1/bills': () => {
        billed = true;
        // The server already queued it on the bill printer while creating it.
        return json({ ...bill(), printQueued: 1 }, 201);
      },
      'POST /api/bills/b1/print': () => json({ id: 'b1', queued: 1 }, 201),
    });
    renderWithProviders(<BillArea order={sentOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bill' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/bills').length).toBe(1);
    expect(body(mock, 'POST', '/api/orders/o1/bills')).toEqual({});
    expect(header(mock, 'POST', '/api/orders/o1/bills', 'If-Match')).toBe('3');
    const shown = await screen.findByRole('region', { name: 'Bill 12' });
    expect(within(shown).getByText('Tax Invoice')).toBeInTheDocument();
    expect(within(shown).getByText('CGST 2.5%')).toBeInTheDocument();
    expect(within(shown).getByText('₹473')).toBeInTheDocument();
    expect(await screen.findByText('Sent to the bill printer.')).toBeInTheDocument();
    // Printing it again would hand the customer a second copy.
    expect(callsTo(mock, 'POST', '/api/bills/b1/print')).toHaveLength(0);
  });

  it('prints a new bill here when no bill printer is set up', async () => {
    as(CASHIER);
    const mock = mockApi({
      'GET /api/orders/o1/bills': () => json([]),
      'POST /api/orders/o1/bills': () => json({ ...bill(), printQueued: 0 }, 201),
      'GET /api/bills/b1/print-payload': () => new Promise<Response>(() => undefined),
    });
    renderWithProviders(<BillArea order={sentOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bill' }));
    await expect.poll(() => callsTo(mock, 'GET', '/api/bills/b1/print-payload').length).toBe(1);
    expect(callsTo(mock, 'POST', '/api/bills/b1/print')).toHaveLength(0);
  });

  it('lets staff add a customer GSTIN on a paid bill before reprinting it', async () => {
    as(CASHIER);
    mockApi({
      'GET /api/orders/o1/bills': () => json([bill({ status: 'PAID', paid: 47300, due: 0 })]),
    });
    renderWithProviders(<BillArea order={sentOrder({ status: 'BILLED' })} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Bill 12/ }));
    const shown = await screen.findByRole('region', { name: 'Bill 12' });
    expect(within(shown).getByRole('button', { name: 'Print' })).toBeInTheDocument();
    expect(within(shown).getByRole('button', { name: 'Add customer GSTIN' })).toBeInTheDocument();
  });

  it('blocks billing a table with dishes not sent to the kitchen', async () => {
    as(CASHIER);
    mockApi({ 'GET /api/orders/o1/bills': () => json([]) });
    renderWithProviders(
      <BillArea order={sentOrder({ items: [...sentOrder().items, line({ id: 'l3' })] })} />,
    );
    expect(await screen.findByRole('button', { name: 'Bill' })).toBeDisabled();
    expect(screen.getByText('Send the new dishes to the kitchen first.')).toBeInTheDocument();
  });

  it('sends unsent parcel dishes before billing', async () => {
    as(CASHIER);
    const mock = mockApi({
      'GET /api/orders/o1/bills': () => json([]),
      'POST /api/orders/o1/kot': () => json({ order: order(), kots: [] }, 201),
      'POST /api/orders/o1/bills': () => json(bill({ orderType: 'PARCEL' }), 201),
      'POST /api/bills/b1/print': () => json({ id: 'b1', queued: 1 }, 201),
    });
    const parcel = sentOrder({
      type: 'PARCEL',
      table: null,
      tokenNo: 4,
      items: [...sentOrder().items, line({ id: 'l3' })],
    });
    renderWithProviders(<BillArea order={parcel} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send & bill' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/bills').length).toBe(1);
    const order_ = mock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`);
    expect(order_.indexOf('POST /api/orders/o1/kot')).toBeLessThan(
      order_.indexOf('POST /api/orders/o1/bills'),
    );
    expect(header(mock, 'POST', '/api/orders/o1/kot', 'Idempotency-Key')).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('splits the bill by dishes', async () => {
    as(CASHIER);
    const mock = mockApi({
      'GET /api/orders/o1/bills': () => json([]),
      'POST /api/orders/o1/bills': () => json(bill(), 201),
      'POST /api/bills/b1/print': () => json({ id: 'b1', queued: 1 }, 201),
    });
    renderWithProviders(<BillArea order={sentOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Split bill' }));
    const sheet = await screen.findByRole('dialog', { name: 'Split bill' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'One more Paneer Tikka' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Bill selected' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/bills').length).toBe(1);
    expect(body(mock, 'POST', '/api/orders/o1/bills')).toEqual({
      lines: [{ orderItemId: 'l1', quantity: 1 }],
    });
  });

  it('lists earlier bills and hides Bill once everything is billed', async () => {
    as(CASHIER);
    mockApi({
      'GET /api/orders/o1/bills': () =>
        json([bill({ id: 'b0', billNo: 11, status: 'VOID' }), bill()]),
    });
    const billedOrder = sentOrder({
      status: 'BILLED',
      items: sentOrder().items.map((i) => ({ ...i, billedQuantity: i.quantity })),
    });
    renderWithProviders(<BillArea order={billedOrder} />);
    expect(await screen.findByRole('region', { name: 'Bill 12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bill 11 · ₹473 · Void' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bill' })).toBeNull();
  });
});

describe('discounts', () => {
  const billedOrder = () =>
    sentOrder({
      status: 'BILLED',
      items: sentOrder().items.map((i) => ({ ...i, billedQuantity: i.quantity })),
    });

  it('applies a 10% discount with a reason', async () => {
    as(CASHIER);
    const mock = mockApi({
      'GET /api/orders/o1/bills': () => json([bill()]),
      'PUT /api/bills/b1/discount': () => json(bill({ billDiscount: 4500 })),
    });
    renderWithProviders(<BillArea order={billedOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discount' }));
    const sheet = await screen.findByRole('dialog', { name: 'Discount on bill 12' });
    fireEvent.change(within(sheet).getByLabelText('Discount on the bill (%)'), {
      target: { value: '10' },
    });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Regular customer' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apply discount' }));
    await expect.poll(() => callsTo(mock, 'PUT', '/api/bills/b1/discount').length).toBe(1);
    expect(body(mock, 'PUT', '/api/bills/b1/discount')).toEqual({
      bill: { kind: 'PERCENT', value: 1000 },
      items: [],
      reasonCode: 'REGULAR',
    });
    expect(header(mock, 'PUT', '/api/bills/b1/discount', 'If-Match')).toBe('4');
  });

  it('takes a flat rupee discount on one dish', async () => {
    as(CASHIER);
    const mock = mockApi({
      'GET /api/orders/o1/bills': () => json([bill()]),
      'PUT /api/bills/b1/discount': () => json(bill()),
    });
    renderWithProviders(<BillArea order={billedOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discount' }));
    const sheet = await screen.findByRole('dialog', { name: 'Discount on bill 12' });
    fireEvent.change(within(sheet).getByLabelText('₹ off Tandoori Roti'), {
      target: { value: '10' },
    });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Other' }));
    fireEvent.change(within(sheet).getByLabelText('What happened'), {
      target: { value: 'Burnt' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apply discount' }));
    await expect.poll(() => callsTo(mock, 'PUT', '/api/bills/b1/discount').length).toBe(1);
    expect(body(mock, 'PUT', '/api/bills/b1/discount')).toEqual({
      bill: null,
      items: [{ billItemId: 'bl2', discount: { kind: 'FLAT', value: 1000 } }],
      reasonCode: 'OTHER',
      note: 'Burnt',
    });
  });

  it('needs a reason before asking the server', async () => {
    as(CASHIER);
    const mock = mockApi({ 'GET /api/orders/o1/bills': () => json([bill()]) });
    renderWithProviders(<BillArea order={billedOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discount' }));
    const sheet = await screen.findByRole('dialog', { name: 'Discount on bill 12' });
    fireEvent.change(within(sheet).getByLabelText('Discount on the bill (%)'), {
      target: { value: '5' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apply discount' }));
    expect(await within(sheet).findByText('Give a reason for the discount.')).toBeInTheDocument();
    expect(callsTo(mock, 'PUT', '/api/bills/b1/discount')).toHaveLength(0);
  });

  it('needs a note when the reason is Other', async () => {
    as(CASHIER);
    const mock = mockApi({ 'GET /api/orders/o1/bills': () => json([bill()]) });
    renderWithProviders(<BillArea order={billedOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discount' }));
    const sheet = await screen.findByRole('dialog', { name: 'Discount on bill 12' });
    expect(within(sheet).queryByLabelText('What happened')).toBeNull();
    fireEvent.change(within(sheet).getByLabelText('Discount on the bill (%)'), {
      target: { value: '5' },
    });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Other' }));
    expect(within(sheet).getByLabelText('What happened')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apply discount' }));
    expect(await within(sheet).findByText('Give a reason for the discount.')).toBeInTheDocument();
    expect(callsTo(mock, 'PUT', '/api/bills/b1/discount')).toHaveLength(0);
  });

  it('asks a manager above the cashier limit and sends their approval', async () => {
    as(CASHIER);
    let attempt = 0;
    const mock = mockApi({
      'GET /api/orders/o1/bills': () => json([bill()]),
      'GET /api/auth/approvers': () => json([{ id: 'm1', name: 'Meena' }]),
      'POST /api/auth/override': () => json({ overrideToken: 'tok' }, 201),
      'PUT /api/bills/b1/discount': () => {
        attempt += 1;
        return attempt === 1
          ? json(
              {
                code: 'DISCOUNT_OVER_LIMIT',
                message: 'This discount needs a manager.',
                capBp: 1000,
                allowed: 4500,
              },
              403,
            )
          : json(bill({ billDiscount: 9000 }));
      },
    });
    renderWithProviders(<BillArea order={billedOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discount' }));
    const sheet = await screen.findByRole('dialog', { name: 'Discount on bill 12' });
    fireEvent.change(within(sheet).getByLabelText('Discount on the bill (%)'), {
      target: { value: '20' },
    });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Complaint' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apply discount' }));
    expect(
      await within(sheet).findByText('This discount needs a manager. The cashier limit is ₹45.'),
    ).toBeInTheDocument();
    await within(sheet).findByRole('option', { name: 'Meena' });
    fireEvent.change(within(sheet).getByLabelText('Manager'), { target: { value: 'm1' } });
    fireEvent.change(within(sheet).getByLabelText('Manager PIN'), { target: { value: '9999' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Approve' }));
    await expect.poll(() => callsTo(mock, 'PUT', '/api/bills/b1/discount').length).toBe(2);
    const second = callsTo(mock, 'PUT', '/api/bills/b1/discount')[1]?.[1];
    expect(new Headers(second?.headers).get('x-override-token')).toBe('tok');
  });

  it('shows a bill changed on another counter and refreshes it', async () => {
    as(CASHIER);
    const mock = mockApi({
      'GET /api/orders/o1/bills': () => json([bill()]),
      'PUT /api/bills/b1/discount': () =>
        json(
          {
            code: 'BILL_CHANGED',
            message:
              'Someone else changed this bill. It has been refreshed; check it and try again.',
          },
          409,
        ),
    });
    renderWithProviders(<BillArea order={billedOrder()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discount' }));
    const sheet = await screen.findByRole('dialog', { name: 'Discount on bill 12' });
    fireEvent.change(within(sheet).getByLabelText('Discount on the bill (%)'), {
      target: { value: '5' },
    });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Regular customer' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Apply discount' }));
    expect(
      await within(sheet).findByText(
        'Someone else changed this bill. It has been refreshed; check it and try again.',
      ),
    ).toBeInTheDocument();
    await expect.poll(() => callsTo(mock, 'GET', '/api/orders/o1/bills').length).toBe(2);
  });

  it('hides the discount for staff without the permission', async () => {
    as(['order.take', 'bill.print'], 'WAITER');
    mockApi({ 'GET /api/orders/o1/bills': () => json([bill()]) });
    renderWithProviders(<BillArea order={billedOrder()} />);
    await screen.findByRole('region', { name: 'Bill 12' });
    expect(screen.queryByRole('button', { name: 'Discount' })).toBeNull();
  });
});
