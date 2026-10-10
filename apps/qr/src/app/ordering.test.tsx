import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
        {
          id: 'kulcha',
          name: 'Chicken Kulcha',
          description: 'Stuffed with spiced chicken',
          foodType: 'NON_VEG',
          variants: [{ id: 'kulcha-r', name: 'Regular', price: 9000 }],
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
  fireEvent.click(within(sheet).getByRole('button', { name: /^Add item · ₹420/ }));
}

describe('browsing the menu', () => {
  const open = async () => {
    api();
    render(<App search={`?t=${CODE}`} />);
    await screen.findByRole('button', { name: /^Paneer Tikka/ });
  };

  it('reads each dish description and counts dishes with a space', async () => {
    await open();
    expect(screen.getByRole('button', { name: /^Chicken Kulcha/ })).toHaveAccessibleDescription(
      'Stuffed with spiced chicken',
    );
    expect(screen.getByRole('heading', { level: 2, name: /^Breads/ })).toHaveTextContent(
      /^Breads 2 dishes$/,
    );
  });

  it('says when Veg only hides the matches, and can show them', async () => {
    await open();
    fireEvent.click(screen.getByRole('switch', { name: 'Veg only' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: 'chicken' },
    });
    expect(screen.getByText('No veg dishes match "chicken"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show non-veg too' }));
    expect(screen.getByRole('button', { name: /^Chicken Kulcha/ })).toBeInTheDocument();
  });

  it('stops the page scrolling behind an open sheet', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await screen.findByRole('dialog', { name: 'Menu' });
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Menu' }), { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });

  it('shows every category as its own section', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 2, name: /^Starters/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Breads/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tandoori Roti/ })).toBeInTheDocument();
  });

  it('finds dishes by name and says when nothing matches', async () => {
    await open();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: 'roti' },
    });
    expect(screen.getByRole('button', { name: /^Tandoori Roti/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Paneer Tikka/ })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: 'pizza' },
    });
    expect(screen.getByText('No dishes match "pizza"')).toBeInTheDocument();
  });

  it('hides non-veg dishes when Veg only is on', async () => {
    await open();
    expect(screen.getByRole('button', { name: /^Chicken Kulcha/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Veg only' }));
    expect(screen.queryByRole('button', { name: /^Chicken Kulcha/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Tandoori Roti/ })).toBeInTheDocument();
  });

  it('jumps to a category from the Menu button, clearing filters and moving focus there', async () => {
    await open();
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    fireEvent.click(screen.getByRole('switch', { name: 'Veg only' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: 'paneer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const list = await screen.findByRole('dialog', { name: 'Menu' });
    fireEvent.click(within(list).getByRole('button', { name: /^Breads/ }));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Search dishes' })).toHaveValue('');
    expect(screen.getByRole('switch', { name: 'Veg only' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    const breads = screen.getByRole('heading', { level: 2, name: /^Breads/ });
    await waitFor(() => expect(breads).toHaveFocus());
    expect(scrolled).toHaveBeenCalled();
    scrolled.mockRestore();
  });

  it('keeps keyboard focus in an open sheet, closes on Escape and returns focus', async () => {
    await open();
    const trigger = screen.getByRole('button', { name: 'Menu' });
    trigger.focus();
    fireEvent.click(trigger);
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('keeps focus on the dish when ADD turns into a counter, and names the count', async () => {
    await open();
    screen.getByRole('button', { name: 'Add Tandoori Roti' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Add Tandoori Roti' }));
    const more = screen.getByRole('button', { name: 'One more Tandoori Roti' });
    await waitFor(() => expect(more).toHaveFocus());
    expect(screen.getByRole('group', { name: 'Tandoori Roti, 1 in order' })).toBeInTheDocument();
    expect(more).toHaveClass('w-11');
    fireEvent.click(screen.getByRole('button', { name: 'One less Tandoori Roti' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Tandoori Roti' })).toHaveFocus(),
    );
  });

  it('adds a plain dish from its row and from its sheet into the same line', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Add Tandoori Roti' }));
    fireEvent.click(screen.getByRole('button', { name: /^Tandoori Roti/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Tandoori Roti' });
    fireEvent.click(within(sheet).getByRole('button', { name: /^Add item/ }));
    expect(screen.getByRole('group', { name: 'Tandoori Roti, 2 in order' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^View order/ }));
    const cart = await screen.findByRole('dialog', { name: 'Your order' });
    expect(within(cart).getAllByRole('listitem')).toHaveLength(1);
  });

  it('opens the order when − could mean more than one choice of the dish', async () => {
    await open();
    await addPaneerWithCheese();
    fireEvent.click(screen.getByRole('button', { name: /^Paneer Tikka/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Paneer Tikka' });
    fireEvent.click(within(sheet).getByRole('button', { name: /^Add item/ }));
    fireEvent.click(screen.getByRole('button', { name: 'One less Paneer Tikka' }));
    expect(await screen.findByRole('dialog', { name: 'Your order' })).toBeInTheDocument();
  });

  it('adds a plain dish with ADD and turns it into a counter', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Add Tandoori Roti' }));
    const more = screen.getByRole('button', { name: 'One more Tandoori Roti' });
    expect(more.parentElement).toHaveTextContent('1');
    fireEvent.click(more);
    expect(more.parentElement).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /^View order, 2 items/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'One less Tandoori Roti' }));
    fireEvent.click(screen.getByRole('button', { name: 'One less Tandoori Roti' }));
    expect(screen.getByRole('button', { name: 'Add Tandoori Roti' })).toBeInTheDocument();
  });

  it('opens the choices for a dish that has sizes or extras', async () => {
    await open();
    const row = screen.getByRole('button', { name: /^Paneer Tikka/ }).closest('li')!;
    expect(row).toHaveTextContent('Customisable');
    fireEvent.click(within(row).getByRole('button', { name: 'Add Paneer Tikka' }));
    expect(await screen.findByRole('dialog', { name: 'Paneer Tikka' })).toBeInTheDocument();
  });
});

describe('ordering from the table', () => {
  it('shows a menu-shaped placeholder while the menu loads', async () => {
    api({ 'GET /api/qr/menu': () => new Promise<Response>(() => undefined) });
    render(<App search={`?t=${CODE}`} />);
    const loading = await screen.findByRole('status', { name: 'Loading the menu' });
    expect(loading).toHaveTextContent('Loading the menu…');
    expect(loading.querySelectorAll('[data-skeleton="dish"]')).toHaveLength(4);
  });

  it('shows dish photos in the list and the dish sheet', async () => {
    const PHOTO = 'https://photos.example.in/paneer.webp';
    const withPhoto = {
      categories: MENU.categories.map((c) => ({
        ...c,
        items: c.items.map((item) => ({ ...item, imageUrl: item.id === 'paneer' ? PHOTO : null })),
      })),
    };
    api({ 'GET /api/qr/menu': () => json(withPhoto) });
    render(<App search={`?t=${CODE}`} />);
    const row = (await screen.findByRole('button', { name: /^Paneer Tikka/ })).closest('li')!;
    const thumb = row.querySelector('img');
    expect(thumb).toHaveAttribute('src', PHOTO);
    expect(thumb).toHaveAttribute('loading', 'lazy');
    expect(thumb).toHaveAttribute('alt', '');
    expect(
      screen
        .getByRole('button', { name: /^Masala Dosa/ })
        .closest('li')!
        .querySelector('img'),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Paneer Tikka/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Paneer Tikka' });
    // The heading names the dish; the photo is decoration in the sheet.
    expect(sheet.querySelector(`img[src="${PHOTO}"]`)).toHaveAttribute('alt', '');
  });

  it('marks each dish veg / non-veg and says it once to screen readers', async () => {
    api();
    render(<App search={`?t=${CODE}`} />);
    const row = await screen.findByRole('button', { name: /^Paneer Tikka/ });
    expect(row).toHaveAccessibleName(/^Paneer Tikka, Veg, /);
    expect(row.querySelector('svg[aria-label="Veg"]')).not.toBeNull();
  });

  it('uses icon steppers with names and 44 px targets', async () => {
    api();
    render(<App search={`?t=${CODE}`} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Paneer Tikka/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Paneer Tikka' });
    const more = within(sheet).getByRole('button', { name: 'One more' });
    expect(more.querySelector('svg.lucide-plus')).not.toBeNull();
    expect(more).toHaveClass('size-12');
    expect(
      within(sheet).getByRole('button', { name: 'One less' }).querySelector('svg.lucide-minus'),
    ).not.toBeNull();
  });

  it('uses the restaurant brand colours, not hard-coded greens and greys', async () => {
    api();
    render(<App search={`?t=${CODE}`} />);
    await screen.findByRole('button', { name: /^Paneer Tikka/ });
    expect(
      document.querySelectorAll(
        '[class*="emerald-"],[class*="text-slate-"],[class*="bg-slate-"],[class*="border-slate-"]',
      ),
    ).toHaveLength(0);
  });

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
    expect(
      screen.getByRole('heading', { level: 1 }).closest('main')?.querySelector('svg'),
    ).not.toBeNull();
    expect(
      await screen.findByText('This QR code is not in use. Please call the waiter.'),
    ).toBeInTheDocument();
  });

  it('needs the required choice before a dish can be added', async () => {
    api();
    render(<App search={`?t=${CODE}`} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Masala Dosa/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Masala Dosa' });
    expect(within(sheet).getByText('Required')).toBeInTheDocument();
    const add = within(sheet).getByRole('button', { name: /^Add item/ });
    expect(add).toBeDisabled();
    // The add bar stays on screen however long the list of choices is.
    expect(add.closest('[data-sheet-footer]')).toHaveClass('sticky');
    fireEvent.click(within(sheet).getByLabelText('Coconut'));
    expect(within(sheet).getByRole('button', { name: /^Add item/ })).toBeEnabled();
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
    fireEvent.click(await screen.findByRole('button', { name: /^View order, 2 items, ₹420/ }));
    const cart = await screen.findByRole('dialog', { name: 'Your order' });
    fireEvent.change(within(cart).getByLabelText('Cooking instructions (optional)'), {
      target: { value: 'less spicy' },
    });
    fireEvent.click(within(cart).getByRole('button', { name: 'Place order' }));
    expect(await within(cart).findByRole('alert')).toBeInTheDocument();
    fireEvent.click(within(cart).getByRole('button', { name: 'Place order' }));
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

  it('shows each line total, the item total and that GST comes on the bill', async () => {
    api();
    render(<App search={`?t=${CODE}`} />);
    await addPaneerWithCheese();
    fireEvent.click(await screen.findByRole('button', { name: /^View order, 2 items, ₹420/ }));
    const cart = await screen.findByRole('dialog', { name: 'Your order' });
    expect(within(cart).getByText('Item total').parentElement).toHaveTextContent('₹420');
    expect(within(cart).getByText('GST is added on the final bill.')).toBeInTheDocument();
    expect(within(cart).getAllByText('₹420')).not.toHaveLength(0);
  });

  it('says the order is empty after the last dish is removed', async () => {
    api();
    render(<App search={`?t=${CODE}`} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add Tandoori Roti' }));
    fireEvent.click(screen.getByRole('button', { name: /^View order/ }));
    const cart = await screen.findByRole('dialog', { name: 'Your order' });
    fireEvent.click(within(cart).getByRole('button', { name: 'One less Tandoori Roti' }));
    expect(within(cart).getByText('Your order is empty.')).toBeInTheDocument();
    fireEvent.click(within(cart).getByRole('button', { name: 'Back to the menu' }));
    expect(screen.queryByRole('dialog', { name: 'Your order' })).toBeNull();
  });

  it('shows when the staff accepted the order', async () => {
    api({
      'GET /api/qr/orders': () =>
        json([{ ...waiting(), status: 'APPROVED', message: 'Accepted and sent to the kitchen' }]),
    });
    render(<App search={`?t=${CODE}`} />);
    const message = await screen.findByText('Accepted and sent to the kitchen');
    expect(message.closest('article')?.querySelector('svg.lucide-circle-check')).not.toBeNull();
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
