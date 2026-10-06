import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '../auth/store';
import { line, MENU, order } from '../test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '../test/mock-api';
import { renderWithProviders } from '../test/render';
import { MenuBrowser } from './MenuBrowser';
import { OrderPanel } from './OrderPanel';

function body(mock: ReturnType<typeof mockApi>, method: string, path: string, index = 0) {
  const call = callsTo(mock, method, path)[index];
  return JSON.parse(String(call?.[1]?.body));
}

function asWaiter() {
  useSession.getState().setSession(sessionBody('WAITER', ['order.take', 'menu.availability']));
}

describe('MenuBrowser', () => {
  it('adds a dish with one size and no options straight away', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/menu': () => json(MENU),
      'POST /api/orders/o1/items': () => json(order(), 201),
    });
    renderWithProviders(<MenuBrowser orderId="o1" orderType="DINE_IN" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Breads' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tandoori Roti, ₹30' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/items').length).toBe(1);
    expect(body(mock, 'POST', '/api/orders/o1/items')).toEqual({
      items: [{ variantId: 'roti-r', quantity: 1, addonIds: [] }],
    });
  });

  it('counts every tap while earlier dishes are still saving', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/menu': () => json(MENU),
      'POST /api/orders/o1/items': () => new Promise<Response>(() => undefined),
    });
    renderWithProviders(<MenuBrowser orderId="o1" orderType="DINE_IN" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Breads' }));
    const roti = screen.getByRole('button', { name: 'Tandoori Roti, ₹30' });
    fireEvent.click(roti);
    fireEvent.click(roti);
    fireEvent.click(roti);
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/items').length).toBe(3);
    expect(await screen.findByText('Adding 3 dishes…')).toBeInTheDocument();
  });

  it('asks for a required choice before adding', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/menu': () => json(MENU),
      'POST /api/orders/o1/items': () => json(order(), 201),
    });
    renderWithProviders(<MenuBrowser orderId="o1" orderType="DINE_IN" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Masala Dosa, ₹120' }));
    const dialog = screen.getByRole('dialog', { name: 'Masala Dosa' });
    const add = within(dialog).getByRole('button', { name: /Add to order/ });
    expect(add).toBeDisabled();
    expect(within(dialog).getByText('Pick 1')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('Coconut'));
    expect(add).toBeEnabled();
    fireEvent.click(add);
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/items').length).toBe(1);
    expect(body(mock, 'POST', '/api/orders/o1/items')).toEqual({
      items: [{ variantId: 'dosa-r', quantity: 1, addonIds: ['coconut'] }],
    });
  });

  it('lets the waiter pick a size, extras, a note and a quantity', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/menu': () => json(MENU),
      'POST /api/orders/o1/items': () => json(order(), 201),
    });
    renderWithProviders(<MenuBrowser orderId="o1" orderType="DINE_IN" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Paneer Tikka, from ₹180' }));
    const dialog = screen.getByRole('dialog', { name: 'Paneer Tikka' });
    fireEvent.click(within(dialog).getByLabelText('Full ₹320'));
    fireEvent.click(within(dialog).getByLabelText('Cheese +₹30'));
    expect(within(dialog).getByLabelText('Butter (out of stock)')).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Note for the kitchen'), {
      target: { value: 'less spicy' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'One more' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to order · ₹700' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/items').length).toBe(1);
    expect(body(mock, 'POST', '/api/orders/o1/items')).toEqual({
      items: [{ variantId: 'paneer-full', quantity: 2, addonIds: ['cheese'], note: 'less spicy' }],
    });
  });

  it('shows out-of-stock dishes but does not let them be added', async () => {
    asWaiter();
    mockApi({ 'GET /api/menu': () => json(MENU) });
    renderWithProviders(<MenuBrowser orderId="o1" orderType="DINE_IN" />);
    expect(await screen.findByRole('button', { name: 'Veg Soup, out of stock' })).toBeDisabled();
  });

  it('finds dishes by name across categories', async () => {
    asWaiter();
    mockApi({ 'GET /api/menu': () => json(MENU) });
    renderWithProviders(<MenuBrowser orderId="o1" orderType="DINE_IN" />);
    fireEvent.change(await screen.findByLabelText('Search dishes'), { target: { value: 'roti' } });
    expect(screen.getByRole('button', { name: 'Tandoori Roti, ₹30' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Masala Dosa/ })).toBeNull();
  });
});

describe('OrderPanel', () => {
  const newLine = line({ id: 'l1', quantity: 1, lineTotal: 3000 });
  const sentLine = line({
    id: 'l2',
    itemName: 'Paneer Tikka',
    variantName: 'Half',
    unitPrice: 18000,
    quantity: 2,
    lineTotal: 36000,
    status: 'SENT',
    kotId: 'k1',
    stationId: 'kitchen',
  });
  const withItems = order({
    items: [sentLine, newLine],
    kots: [
      {
        id: 'k1',
        kotNo: 7,
        type: 'NEW',
        status: 'PREPARING',
        stationId: 'kitchen',
        stationName: 'Kitchen',
        createdAt: '',
        print: 'FAILED',
      },
    ],
    subtotal: 39000,
  });

  it('shows sent and unsent dishes with the total', async () => {
    asWaiter();
    mockApi({ 'GET /api/orders/o1': () => json(withItems) });
    renderWithProviders(<OrderPanel orderId="o1" />);
    expect(await screen.findByRole('heading', { name: 'T1' })).toBeInTheDocument();
    expect(screen.getByText('KOT 7 · Kitchen · preparing')).toBeInTheDocument();
    expect(screen.getByText('₹390')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to kitchen (1)' })).toBeEnabled();
  });

  it('sends to the kitchen once, with a request id, and blocks double taps', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/orders/o1': () => json(withItems),
      'POST /api/orders/o1/kot': () => new Promise<Response>(() => undefined),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    const send = await screen.findByRole('button', { name: 'Send to kitchen (1)' });
    fireEvent.click(send);
    fireEvent.click(send);
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/kot').length).toBe(1);
    const headers = new Headers(callsTo(mock, 'POST', '/api/orders/o1/kot')[0]?.[1]?.headers);
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByRole('button', { name: /Sending/ })).toBeDisabled();
  });

  it('reuses the request id when a failed send is tried again', async () => {
    asWaiter();
    let attempt = 0;
    const mock = mockApi({
      'GET /api/orders/o1': () => json(withItems),
      'POST /api/orders/o1/kot': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return json({ order: withItems, kots: [] }, 201);
      },
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send to kitchen (1)' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Send to kitchen (1)' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/kot').length).toBe(2);
    const keys = callsTo(mock, 'POST', '/api/orders/o1/kot').map(([, init]) =>
      new Headers(init?.headers).get('Idempotency-Key'),
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it('changes the quantity of an unsent dish', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/orders/o1': () => json(withItems),
      'PATCH /api/orders/o1/items/l1': () => json(withItems),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'One more Tandoori Roti' }));
    await expect.poll(() => callsTo(mock, 'PATCH', '/api/orders/o1/items/l1').length).toBe(1);
    expect(body(mock, 'PATCH', '/api/orders/o1/items/l1')).toEqual({ quantity: 2 });
  });

  it('sends the order version with a quantity change and shows a refusal', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/orders/o1': () => json(withItems),
      'PATCH /api/orders/o1/items/l1': () =>
        json({ code: 'ORDER_CHANGED', message: 'The order was changed on another screen.' }, 409),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'One more Tandoori Roti' }));
    expect(await screen.findByText('The order was changed on another screen.')).toBeInTheDocument();
    const [, init] = callsTo(mock, 'PATCH', '/api/orders/o1/items/l1')[0]!;
    expect(new Headers(init?.headers).get('If-Match')).toBe(String(withItems.version));
  });

  it('refreshes the order when sending fails', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/orders/o1': () => json(withItems),
      'POST /api/orders/o1/kot': () =>
        json({ code: 'NOTHING_TO_SEND', message: 'Nothing new to send.' }, 409),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send to kitchen (1)' }));
    await screen.findByText('Nothing new to send.');
    await expect.poll(() => callsTo(mock, 'GET', '/api/orders/o1').length).toBe(2);
  });

  it('shows a failed KOT print and reprints it', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/orders/o1': () => json(withItems),
      'POST /api/kots/k1/reprint': () => json({ id: 'k1', queued: true }, 201),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    expect(await screen.findByText('Print failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reprint KOT 7' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/kots/k1/reprint').length).toBe(1);
  });

  it('gets a manager approval to cancel a dish already in the kitchen', async () => {
    asWaiter();
    const mock = mockApi({
      'GET /api/orders/o1': () => json(withItems),
      'GET /api/auth/approvers': () => json([{ id: 'm1', name: 'Meera', role: 'MANAGER' }]),
      'POST /api/auth/override': () => json({ overrideToken: 'ov-1', expiresInSeconds: 60 }, 201),
      'POST /api/orders/o1/items/l2/cancel': () => json(withItems, 201),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Paneer Tikka' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel Paneer Tikka' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Customer changed mind' },
    });
    fireEvent.change(within(dialog).getByLabelText('How many'), { target: { value: '1' } });
    await within(dialog).findByRole('option', { name: 'Meera' });
    fireEvent.change(within(dialog).getByLabelText('Manager'), { target: { value: 'm1' } });
    fireEvent.change(within(dialog).getByLabelText('Manager PIN'), { target: { value: '9999' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel dish' }));

    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/items/l2/cancel').length).toBe(1);
    expect(body(mock, 'POST', '/api/auth/override')).toEqual({
      userId: 'm1',
      pin: '9999',
      permission: 'item.cancelAfterKot',
    });
    const [call] = callsTo(mock, 'POST', '/api/orders/o1/items/l2/cancel');
    expect(new Headers(call?.[1]?.headers).get('x-override-token')).toBe('ov-1');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      reason: 'Customer changed mind',
      quantity: 1,
    });
  });

  it('lets a manager cancel without asking for a PIN', async () => {
    useSession.getState().setSession(sessionBody('MANAGER', ['order.take', 'item.cancelAfterKot']));
    const mock = mockApi({
      'GET /api/orders/o1': () => json(withItems),
      'POST /api/orders/o1/items/l2/cancel': () => json(withItems, 201),
    });
    renderWithProviders(<OrderPanel orderId="o1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel Paneer Tikka' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel Paneer Tikka' });
    expect(within(dialog).queryByLabelText('Manager PIN')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Burnt' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel dish' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/orders/o1/items/l2/cancel').length).toBe(1);
  });

  it('cancels an order that has nothing in the kitchen', async () => {
    asWaiter();
    const onClosed = vi.fn();
    const empty = order({ items: [newLine], subtotal: 3000 });
    const mock = mockApi({
      'GET /api/orders/o1': () => json(empty),
      'POST /api/orders/o1/cancel': () => json({ ...empty, status: 'CANCELLED' }, 201),
    });
    renderWithProviders(<OrderPanel orderId="o1" onClosed={onClosed} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    fireEvent.change(screen.getByLabelText('Why cancel this order?'), {
      target: { value: 'Wrong table' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }));
    await expect.poll(() => onClosed.mock.calls.length).toBe(1);
    expect(body(mock, 'POST', '/api/orders/o1/cancel')).toEqual({ reason: 'Wrong table' });
  });
});
