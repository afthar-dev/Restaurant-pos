import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { expectNoAxeViolations } from '@/test/a11y';
import { renderRoute } from '@/test/render';
import type * as photo from '@/shared/lib/photo';
import { shrinkPhoto } from '@/shared/lib/photo';

// jsdom has no canvas: the shrinker is replaced; the upload itself is what is tested here.
vi.mock('@/shared/lib/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof photo>()),
  shrinkPhoto: vi.fn(async () => new Blob(['small'], { type: 'image/webp' })),
}));

const CAT = '00000000-0000-4000-8000-0000000000c1';
const STATION = '00000000-0000-4000-8000-0000000000a1';
const TAX = '00000000-0000-4000-8000-0000000000b1';

const menu = {
  categories: [
    {
      id: CAT,
      name: 'Starters',
      sortOrder: 0,
      station: { id: STATION, name: 'Kitchen' },
      items: [
        {
          id: 'i1',
          categoryId: CAT,
          name: 'Veg Soup',
          description: null,
          foodType: 'VEG',
          isAvailable: true,
          isCombo: false,
          imageUrl: null,
          taxRate: { id: TAX, name: 'GST 5%', cgstBp: 250, sgstBp: 250 },
          variants: [
            { id: 'v1', name: 'Regular', dineInPrice: 9000, parcelPrice: 9000, packagingCharge: 0 },
          ],
          addonGroups: [],
          components: [],
        },
        {
          id: 'i3',
          categoryId: CAT,
          name: 'Tomato Soup',
          description: null,
          foodType: 'VEG',
          isAvailable: true,
          isCombo: false,
          imageUrl: null,
          taxRate: null,
          variants: [
            { id: 'v3', name: 'Regular', dineInPrice: 8000, parcelPrice: 8000, packagingCharge: 0 },
          ],
          addonGroups: [],
          components: [],
        },
      ],
    },
  ],
};

function baseApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/menu': () => json(menu),
    'GET /api/tax-rates': () =>
      json([{ id: TAX, name: 'GST 5%', cgstBp: 250, sgstBp: 250, totalBp: 500, archivedAt: null }]),
    'GET /api/stations': () => json([{ id: STATION, name: 'Kitchen', archivedAt: null }]),
    'GET /api/menu/addon-groups': () => json([]),
    ...extra,
  });
}

function asManager() {
  useSession.getState().setSession(sessionBody('MANAGER', ['menu.manage', 'menu.availability']));
}

async function openNewItem() {
  renderRoute('/admin/menu');
  expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
  expect(screen.getByText('Regular ₹90')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
}

function setVariant(row: number, name: string, price: string) {
  fireEvent.change(screen.getByLabelText(`Size ${row} name`), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(`Size ${row} dine-in price (₹)`), {
    target: { value: price },
  });
}

describe('MenuPage item editor', () => {
  it('adds a photo to a new dish after saving it', async () => {
    asManager();
    const mock = baseApi({
      'POST /api/menu/items': ({ body }) =>
        json({ id: 'i9', ...(body as object), imageUrl: null }, 201),
      'PUT /api/menu/items/i9/image': () => json({ id: 'i9', imageUrl: '/api/media/m1.webp' }),
    });
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Lassi' } });
    setVariant(1, 'Regular', '60');
    const file = new File(['big'], 'lassi.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Add photo'), { target: { files: [file] } });
    expect(await screen.findByRole('img', { name: 'Photo of Lassi' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await expect.poll(() => callsTo(mock, 'PUT', '/api/menu/items/i9/image').length).toBe(1);
    expect(callsTo(mock, 'POST', '/api/menu/items')).toHaveLength(1);
    const sent = callsTo(mock, 'PUT', '/api/menu/items/i9/image')[0]![1]!.body;
    expect(sent).toBeInstanceOf(FormData);
    expect((sent as FormData).get('image')).toBeInstanceOf(Blob);
  });

  it('says at once when a photo cannot be read, and saves no photo', async () => {
    asManager();
    vi.mocked(shrinkPhoto).mockRejectedValueOnce(new Error('Could not read this photo.'));
    const mock = baseApi({
      'POST /api/menu/items': ({ body }) =>
        json({ id: 'i9', ...(body as object), imageUrl: null }, 201),
    });
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Lassi' } });
    setVariant(1, 'Regular', '60');
    fireEvent.change(screen.getByLabelText('Add photo'), {
      target: { files: [new File(['heic'], 'l.heic', { type: 'image/heic' })] },
    });
    expect(await screen.findByText('Could not read this photo.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Photo of Lassi' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/menu/items').length).toBe(1);
    expect(callsTo(mock, 'PUT', '/api/menu/items/i9/image')).toHaveLength(0);
  });

  it('shows keyboard focus on the photo button', async () => {
    asManager();
    baseApi({});
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const label = screen.getByLabelText('Add photo').closest('label');
    expect(label?.className).toContain('has-[:focus-visible]:outline-2');
  });

  it('removes a dish photo', async () => {
    asManager();
    const withPhoto = {
      categories: [
        {
          ...menu.categories[0]!,
          items: menu.categories[0]!.items.map((i, n) =>
            n === 0
              ? {
                  ...i,
                  imageUrl: '/api/media/m1.webp',
                  // Real size ids are UUIDs; the editor's schema refuses anything else.
                  variants: i.variants.map((v) => ({
                    ...v,
                    id: '00000000-0000-4000-8000-0000000000d1',
                  })),
                }
              : i,
          ),
        },
      ],
    };
    const mock = baseApi({
      'GET /api/menu': () => json(withPhoto),
      'PUT /api/menu/items/i1': ({ body }) => json({ id: 'i1', ...(body as object) }),
      'DELETE /api/menu/items/i1/image': () => json({ id: 'i1', imageUrl: null }),
    });
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await expect.poll(() => callsTo(mock, 'DELETE', '/api/menu/items/i1/image').length).toBe(1);
  });

  it('keeps the dish saved and says so when the photo fails', async () => {
    asManager();
    baseApi({
      'POST /api/menu/items': ({ body }) =>
        json({ id: 'i9', ...(body as object), imageUrl: null }, 201),
      'PUT /api/menu/items/i9/image': () =>
        json({ code: 'FILE_TOO_LARGE', message: 'The photo is too big. Use one under 1 MB.' }, 413),
    });
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Lassi' } });
    setVariant(1, 'Regular', '60');
    fireEvent.change(screen.getByLabelText('Add photo'), {
      target: { files: [new File(['x'], 'l.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByRole('img', { name: 'Photo of Lassi' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    expect(
      await screen.findByText(
        'Lassi is saved, but its photo was not: The photo is too big. Use one under 1 MB.',
      ),
    ).toBeInTheDocument();
  });

  it('reorders dishes with Move up and saves the new order', async () => {
    asManager();
    const mock = baseApi({
      [`PUT /api/menu/categories/${CAT}/items/order`]: () => json({ updated: 2 }),
    });
    renderRoute('/admin/menu');
    // Reorder is off until the menu has loaded.
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
    const ids = menu.categories[0]!.items.map((i) => i.id);
    const second = menu.categories[0]!.items[1]!;
    fireEvent.click(screen.getByRole('button', { name: `Move ${second.name} up` }));
    await expect
      .poll(() => callsTo(mock, 'PUT', `/api/menu/categories/${CAT}/items/order`).length)
      .toBe(1);
    expect(
      JSON.parse(
        String(callsTo(mock, 'PUT', `/api/menu/categories/${CAT}/items/order`)[0]![1]!.body),
      ),
    ).toEqual({ ids: [ids[1], ids[0]] });
    expect(screen.queryByRole('button', { name: /^Duplicate/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getAllByRole('button', { name: /^Duplicate/ }).length).toBeGreaterThan(0);
  });

  it('puts the order back and says why when saving fails', async () => {
    asManager();
    baseApi({
      [`PUT /api/menu/categories/${CAT}/items/order`]: () =>
        json(
          {
            code: 'INVALID_REFERENCE',
            message: 'Something you picked is no longer available. Refresh and try again.',
          },
          400,
        ),
    });
    renderRoute('/admin/menu');
    // Reorder is off until the menu has loaded.
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
    const [first, second] = menu.categories[0]!.items;
    fireEvent.click(screen.getByRole('button', { name: `Move ${second!.name} up` }));
    expect(await screen.findByText(/no longer available/)).toBeInTheDocument();
    const dishes = within(screen.getByRole('list', { name: 'Dishes in Starters' }));
    const rows = dishes.getAllByRole('button', { name: /^Move .* down$/ });
    expect(rows[0]).toHaveAccessibleName(`Move ${first!.name} down`);
  });

  it('saves one reorder at a time, in the order they were made', async () => {
    asManager();
    let release: (() => void) | undefined;
    const mock = baseApi({
      [`PUT /api/menu/categories/${CAT}/items/order`]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json({ updated: 2 }));
        }),
    });
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Tomato Soup up' }));
    // A person taps again once the row has moved.
    await expect
      .poll(() =>
        screen.getByRole('button', { name: 'Move Tomato Soup up' }).getAttribute('aria-disabled'),
      )
      .toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Move Tomato Soup down' }));
    const puts = () => callsTo(mock, 'PUT', `/api/menu/categories/${CAT}/items/order`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(puts()).toHaveLength(1);
    release!();
    await expect.poll(() => puts().length).toBe(2);
    expect(JSON.parse(String(puts()[1]![1]!.body))).toEqual({ ids: ['i1', 'i3'] });
  });

  it('keeps focus on the arrow and says where the dish went', async () => {
    asManager();
    // The server keeps the new order, so the refetch after saving shows it too.
    let saved = menu;
    baseApi({
      'GET /api/menu': () => json(saved),
      [`PUT /api/menu/categories/${CAT}/items/order`]: ({ body }) => {
        const ids = (body as { ids: string[] }).ids;
        const items = ids.map((id) => menu.categories[0]!.items.find((i) => i.id === id)!);
        saved = { categories: [{ ...menu.categories[0]!, items }] };
        return json({ updated: 2 });
      },
    });
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
    const up = screen.getByRole('button', { name: 'Move Tomato Soup up' });
    up.focus();
    fireEvent.click(up);
    expect(await screen.findByText('Tomato Soup moved to position 1 of 2')).toBeInTheDocument();
    await expect
      .poll(() =>
        screen.getByRole('button', { name: 'Move Tomato Soup up' }).getAttribute('aria-disabled'),
      )
      .toBe('true');
    const after = screen.getByRole('button', { name: 'Move Tomato Soup up' });
    expect(after).not.toBeDisabled();
    await expect.poll(() => document.activeElement).toBe(after);
  });

  it('hides reorder controls while searching', async () => {
    asManager();
    baseApi({});
    renderRoute('/admin/menu');
    // Reorder is off until the menu has loaded.
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: 'soup' },
    });
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
  });

  it('narrows the menu as you search and clears again', async () => {
    asManager();
    baseApi({});
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No dishes match "zzz"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Veg Soup')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: '  veg SOUP ' },
    });
    expect(screen.getByText('1 dish matches "veg SOUP"')).toBeInTheDocument();
  });

  it('duplicates a dish as a new one without the old size ids', async () => {
    asManager();
    const mock = baseApi({
      'POST /api/menu/items': ({ body }) => json({ id: 'i2', ...(body as object) }, 201),
    });
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Veg Soup' }));
    expect(screen.getByRole('heading', { name: 'New item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Item name')).toHaveValue('Veg Soup (copy)');
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/menu/items').length).toBe(1);
    const sent = JSON.parse(String(callsTo(mock, 'POST', '/api/menu/items')[0]![1]!.body));
    expect(sent.name).toBe('Veg Soup (copy)');
    expect(sent.variants.every((v: { id?: string }) => v.id === undefined)).toBe(true);
    expect(sent.variants[0].dineInPrice).toBe(9000);
  });

  it('has no accessibility problems on the menu screen', async () => {
    asManager();
    baseApi({});
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('saves sizes in paise and leaves parcel price to default', async () => {
    asManager();
    const mock = baseApi({
      'POST /api/menu/items': ({ body }) => json({ id: 'i2', ...(body as object) }, 201),
    });
    await openNewItem();

    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Paneer Tikka' } });
    setVariant(1, 'Half', '120');
    fireEvent.click(screen.getByRole('button', { name: 'Add size' }));
    setVariant(2, 'Full', '220.50');
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));

    await expect.poll(() => callsTo(mock, 'POST', '/api/menu/items').length).toBe(1);
    const [call] = callsTo(mock, 'POST', '/api/menu/items');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      categoryId: CAT,
      name: 'Paneer Tikka',
      description: null,
      foodType: 'VEG',
      taxRateId: TAX,
      variants: [
        { name: 'Half', dineInPrice: 12000 },
        { name: 'Full', dineInPrice: 22050 },
      ],
      addonGroupIds: [],
      isCombo: false,
      components: [],
    });
  });

  it('marks no-GST dishes in the menu list', async () => {
    asManager();
    baseApi();
    renderRoute('/admin/menu');
    const row = (await screen.findByText('Tomato Soup')).closest('li')!;
    expect(row).toHaveTextContent('No GST');
    expect(screen.getByText('Veg Soup').closest('li')).not.toHaveTextContent('No GST');
  });

  it('saves a no-GST dish, such as chai at a fixed price', async () => {
    asManager();
    const mock = baseApi({
      'POST /api/menu/items': ({ body }) => json({ id: 'i3', ...(body as object) }, 201),
    });
    await openNewItem();
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Masala Chai' } });
    setVariant(1, 'Regular', '30');
    fireEvent.change(screen.getByLabelText('GST'), { target: { value: '' } });
    expect(screen.getByText(/charged at exactly this price/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/menu/items').length).toBe(1);
    const [call] = callsTo(mock, 'POST', '/api/menu/items');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      name: 'Masala Chai',
      taxRateId: null,
    });
  });

  it('rejects a price with more than two decimals', async () => {
    asManager();
    const mock = baseApi();
    await openNewItem();
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Tikka' } });
    setVariant(1, 'Regular', '12.345');
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    expect(await screen.findByText('Enter a price like 120 or 120.50')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/menu/items')).toHaveLength(0);
  });

  it('asks for combo contents before saving a combo', async () => {
    asManager();
    const mock = baseApi();
    await openNewItem();
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Soup Meal' } });
    setVariant(1, 'Regular', '150');
    fireEvent.click(screen.getByLabelText('This is a combo'));
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    expect(await screen.findByText('Add the items in this combo')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/menu/items')).toHaveLength(0);
  });
});

describe('AddonsPage', () => {
  it('rejects a minimum above the maximum', async () => {
    asManager();
    const mock = mockApi({ 'GET /api/menu/addon-groups': () => json([]) });
    renderRoute('/admin/addons');
    fireEvent.change(await screen.findByLabelText('Group name'), { target: { value: 'Extras' } });
    fireEvent.change(screen.getByLabelText('Option 1 name'), { target: { value: 'Cheese' } });
    fireEvent.change(screen.getByLabelText('Option 1 price (₹)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Customer must pick at least'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Customer can pick up to'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    expect(await screen.findByText('Minimum cannot be more than maximum')).toBeInTheDocument();
    expect(callsTo(mock, 'POST', '/api/menu/addon-groups')).toHaveLength(0);
  });

  it('explains add-on groups when there are none', async () => {
    asManager();
    mockApi({ 'GET /api/menu/addon-groups': () => json([]) });
    renderRoute('/admin/addons');
    const title = await screen.findByText('No add-on groups yet');
    expect(title.closest('div')?.querySelector('svg')).not.toBeNull();
  });

  it('saves a group with prices in paise', async () => {
    asManager();
    const mock = mockApi({
      'GET /api/menu/addon-groups': () => json([]),
      'POST /api/menu/addon-groups': ({ body }) => json({ id: 'g1', ...(body as object) }, 201),
    });
    renderRoute('/admin/addons');
    fireEvent.change(await screen.findByLabelText('Group name'), { target: { value: 'Extras' } });
    fireEvent.change(screen.getByLabelText('Option 1 name'), { target: { value: 'Cheese' } });
    fireEvent.change(screen.getByLabelText('Option 1 price (₹)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/menu/addon-groups').length).toBe(1);
    const [call] = callsTo(mock, 'POST', '/api/menu/addon-groups');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      name: 'Extras',
      minSelect: 0,
      maxSelect: 1,
      addons: [{ name: 'Cheese', price: 3000 }],
    });
  });
});

describe('MenuPage category editing (review #3)', () => {
  it('renames a category and changes where its KOTs go', async () => {
    asManager();
    const OTHER = '00000000-0000-4000-8000-0000000000a2';
    const mock = mockApi({
      'GET /api/menu': () => json(menu),
      'GET /api/tax-rates': () => json([]),
      'GET /api/stations': () =>
        json([
          { id: STATION, name: 'Kitchen', archivedAt: null },
          { id: OTHER, name: 'Tandoor', archivedAt: null },
        ]),
      'GET /api/menu/addon-groups': () => json([]),
      [`PUT /api/menu/categories/${CAT}`]: ({ body }) => json({ id: CAT, ...(body as object) }),
    });
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit category' }));
    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Snacks' } });
    fireEvent.change(screen.getByLabelText('KOTs go to'), { target: { value: OTHER } });
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
    await expect.poll(() => callsTo(mock, 'PUT', `/api/menu/categories/${CAT}`).length).toBe(1);
    const [call] = callsTo(mock, 'PUT', `/api/menu/categories/${CAT}`);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      name: 'Snacks',
      stationId: OTHER,
    });
  });
});
