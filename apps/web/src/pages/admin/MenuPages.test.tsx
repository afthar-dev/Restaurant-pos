import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSession } from '../../auth/store';
import { callsTo, json, mockApi, sessionBody } from '../../test/mock-api';
import { renderRoute } from '../../test/render';

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
          taxRate: { id: TAX, name: 'GST 5%', cgstBp: 250, sgstBp: 250 },
          variants: [
            { id: 'v1', name: 'Regular', dineInPrice: 9000, parcelPrice: 9000, packagingCharge: 0 },
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
