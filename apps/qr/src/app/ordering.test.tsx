import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { callsTo, json, mockApi } from '@/test/mock';

const CODE = 'c'.repeat(43);

const started = () =>
  json({ token: 'session-1', table: { name: 'T1' }, outlet: { name: 'Spice Garden' } }, 201);

const MENU = {
  categories: [
    {
      id: 'starters',
      name: 'Starters',
      items: [
        {
          id: 'paneer',
          name: 'Paneer Tikka',
          description: null,
          foodType: 'VEG',
          variants: [
            { id: 'paneer-h', name: 'Half', price: 18000 },
            { id: 'paneer-f', name: 'Full', price: 32000 },
          ],
          addonGroups: [
            {
              id: 'extras',
              name: 'Extras',
              minSelect: 0,
              maxSelect: 2,
              addons: [{ id: 'cheese', name: 'Cheese', price: 3000 }],
            },
          ],
        },
        {
          id: 'dosa',
          name: 'Masala Dosa',
          description: null,
          foodType: 'VEG',
          variants: [{ id: 'dosa-r', name: 'Regular', price: 12000 }],
          addonGroups: [
            {
              id: 'chutney',
              name: 'Chutney',
              minSelect: 1,
              maxSelect: 1,
              addons: [
                { id: 'coconut', name: 'Coconut', price: 0 },
                { id: 'tomato', name: 'Tomato', price: 0 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'breads',
      name: 'Breads',
      items: [
        {
          id: 'roti',
          name: 'Tandoori Roti',
          description: null,
          foodType: 'VEG',
          variants: [{ id: 'roti-r', name: 'Regular', price: 3000 }],
          addonGroups: [],
        },
      ],
    },
  ],
};

const waiting = (id = 's1') => ({
  id,
  status: 'PENDING',
  message: 'Waiting for the staff to confirm',
  lines: [
    {
      itemName: 'Paneer Tikka',
      variantName: 'Half',
      addons: ['Cheese'],
      quantity: 2,
      note: null,
      amount: 42000,
    },
  ],
  note: null,
  total: 42000,
  createdAt: new Date().toISOString(),
});

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'POST /api/qr/sessions': started,
    'GET /api/qr/menu': () => json(MENU),
    'GET /api/qr/orders': () => json([]),
    ...extra,
  });
}

async function addPaneerWithCheese() {
  fireEvent.click(await screen.findByRole('button', { name: /^Paneer Tikka/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Paneer Tikka' });
  fireEvent.click(within(sheet).getByLabelText('Cheese +₹30'));
  fireEvent.click(within(sheet).getByRole('button', { name: 'One more' }));
  fireEvent.click(within(sheet).getByRole('button', { name: /^Add · ₹420/ }));
}

describe('ordering from the table', () => {
  it('opens the menu for the table that was scanned', async () => {
    const mock = api();
    render(<App search={`?t=${CODE}`} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Table T1' })).toBeInTheDocument();
    expect(screen.getByText('Spice Garden')).toBeInTheDocument();
    expect(JSON.parse(String(callsTo(mock, 'POST', '/api/qr/sessions')[0]?.[1]?.body))).toEqual({
      code: CODE,
    });
    expect(await screen.findByRole('button', { name: /^Paneer Tikka/ })).toBeInTheDocument();
    const menu = callsTo(mock, 'GET', '/api/qr/menu')[0]?.[1];
    expect(new Headers(menu?.headers).get('x-qr-session')).toBe('session-1');
  });

  it('keeps the session when the page is reloaded', async () => {
    const mock = api();
    const { unmount } = render(<App search={`?t=${CODE}`} />);
    await screen.findByRole('heading', { level: 1, name: 'Table T1' });
    unmount();
    render(<App search={`?t=${CODE}`} />);
    await screen.findByRole('heading', { level: 1, name: 'Table T1' });
    expect(callsTo(mock, 'POST', '/api/qr/sessions')).toHaveLength(1);
  });

  it('says when the QR code is not in use', async () => {
    api({
      'POST /api/qr/sessions': () =>
        json(
          { code: 'QR_UNKNOWN', message: 'This QR code is not in use. Please call the waiter.' },
          404,
        ),
    });
    render(<App search={`?t=${CODE}`} />);
    expect(
      await screen.findByText('This QR code is not in use. Please call the waiter.'),
    ).toBeInTheDocument();
  });

  it('needs the required choice before a dish can be added', async () => {
    api();
    render(<App search={`?t=${CODE}`} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Masala Dosa/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Masala Dosa' });
    expect(within(sheet).getByRole('button', { name: /^Add/ })).toBeDisabled();
    fireEvent.click(within(sheet).getByLabelText('Coconut'));
    expect(within(sheet).getByRole('button', { name: /^Add/ })).toBeEnabled();
  });

  it('sends the cart once, keeping the request id when the network fails', async () => {
    let attempt = 0;
    const mock = api({
      'POST /api/qr/orders': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return json(waiting(), 201);
      },
    });
    render(<App search={`?t=${CODE}`} />);
    await addPaneerWithCheese();
    fireEvent.click(await screen.findByRole('button', { name: /^Your order · 2 dishes · ₹420/ }));
    const cart = await screen.findByRole('dialog', { name: 'Your order' });
    fireEvent.change(within(cart).getByLabelText('Note for the kitchen (optional)'), {
      target: { value: 'less spicy' },
    });
    fireEvent.click(within(cart).getByRole('button', { name: 'Send to the staff' }));
    expect(await within(cart).findByRole('alert')).toBeInTheDocument();
    fireEvent.click(within(cart).getByRole('button', { name: 'Send to the staff' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/qr/orders').length).toBe(2);
    const sent = callsTo(mock, 'POST', '/api/qr/orders');
    const key = (i: number) => new Headers(sent[i]?.[1]?.headers).get('Idempotency-Key');
    expect(key(0)).toMatch(/^[0-9a-f-]{36}$/);
    expect(key(0)).toBe(key(1));
    expect(JSON.parse(String(sent[1]?.[1]?.body))).toEqual({
      lines: [{ variantId: 'paneer-h', quantity: 2, addonIds: ['cheese'] }],
      note: 'less spicy',
    });
    expect(await screen.findByText('Waiting for the staff to confirm')).toBeInTheDocument();
  });

  it('shows when the staff accepted the order', async () => {
    api({
      'GET /api/qr/orders': () =>
        json([{ ...waiting(), status: 'APPROVED', message: 'Accepted — sent to the kitchen' }]),
    });
    render(<App search={`?t=${CODE}`} />);
    expect(await screen.findByText('Accepted — sent to the kitchen')).toBeInTheDocument();
  });

  it('asks to scan again when the table was closed, and starts again', async () => {
    let ended = true;
    const mock = api({
      'GET /api/qr/menu': () =>
        ended
          ? json({ code: 'QR_SESSION_ENDED', message: 'Scan the table QR again.' }, 401)
          : json(MENU),
    });
    localStorage.setItem(
      `rpos.qr.${CODE}`,
      JSON.stringify({ token: 'old', table: 'T1', outlet: 'Spice Garden' }),
    );
    render(<App search={`?t=${CODE}`} />);
    expect(
      await screen.findByText('Your table was closed. Scan the table QR again.'),
    ).toBeInTheDocument();
    ended = false;
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(await screen.findByRole('button', { name: /^Paneer Tikka/ })).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/qr/sessions')).toHaveLength(1);
  });
});
