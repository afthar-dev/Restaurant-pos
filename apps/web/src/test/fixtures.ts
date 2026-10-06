import type { Menu, MenuItem } from '../pages/admin/menu-types';
import type { Order, OrderLine } from '../service/types';

const tax = { id: 'tax', name: 'GST 5%', cgstBp: 250, sgstBp: 250 };

function item(partial: Partial<MenuItem> & Pick<MenuItem, 'id' | 'name' | 'variants'>): MenuItem {
  return {
    categoryId: 'c1',
    description: null,
    foodType: 'VEG',
    isAvailable: true,
    isCombo: false,
    taxRate: tax,
    addonGroups: [],
    components: [],
    ...partial,
  };
}

const v = (id: string, name: string, price: number) => ({
  id,
  name,
  dineInPrice: price,
  parcelPrice: price,
  packagingCharge: 0,
});

export const ROTI = item({
  id: 'roti',
  name: 'Tandoori Roti',
  variants: [v('roti-r', 'Regular', 3000)],
});
export const DOSA = item({
  id: 'dosa',
  name: 'Masala Dosa',
  variants: [v('dosa-r', 'Regular', 12000)],
  addonGroups: [
    {
      id: 'chutney',
      name: 'Chutney',
      minSelect: 1,
      maxSelect: 1,
      addons: [
        { id: 'coconut', name: 'Coconut', price: 0, isAvailable: true },
        { id: 'tomato', name: 'Tomato', price: 0, isAvailable: true },
      ],
    },
  ],
});
export const PANEER = item({
  id: 'paneer',
  name: 'Paneer Tikka',
  variants: [v('paneer-half', 'Half', 18000), v('paneer-full', 'Full', 32000)],
  addonGroups: [
    {
      id: 'extras',
      name: 'Extras',
      minSelect: 0,
      maxSelect: 2,
      addons: [
        { id: 'cheese', name: 'Cheese', price: 3000, isAvailable: true },
        { id: 'butter', name: 'Butter', price: 2000, isAvailable: false },
      ],
    },
  ],
});
export const SOUP = item({
  id: 'soup',
  name: 'Veg Soup',
  isAvailable: false,
  variants: [v('soup-r', 'Regular', 9000)],
});

export const MENU: Menu = {
  categories: [
    {
      id: 'c1',
      name: 'Starters',
      sortOrder: 0,
      station: { id: 'kitchen', name: 'Kitchen' },
      items: [DOSA, PANEER, SOUP],
    },
    {
      id: 'c2',
      name: 'Breads',
      sortOrder: 1,
      station: { id: 'tandoor', name: 'Tandoor' },
      items: [{ ...ROTI, categoryId: 'c2' }],
    },
  ],
};

export function line(partial: Partial<OrderLine> & Pick<OrderLine, 'id'>): OrderLine {
  return {
    itemId: 'roti',
    variantId: 'roti-r',
    itemName: 'Tandoori Roti',
    variantName: 'Regular',
    unitPrice: 3000,
    packagingCharge: 0,
    quantity: 1,
    addons: [],
    comboComponents: [],
    note: null,
    status: 'NEW',
    kotId: null,
    cancelReason: null,
    stationId: 'tandoor',
    createdAt: '2026-10-06T10:00:00Z',
    lineTotal: 3000 * (partial.quantity ?? 1),
    billedQuantity: 0,
    ...partial,
  };
}

export function order(partial: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    type: 'DINE_IN',
    source: 'POS',
    status: 'OPEN',
    table: { id: 't1', name: 'T1' },
    tokenNo: null,
    guests: 2,
    customerName: null,
    waiter: { id: 'w', name: 'Arun' },
    version: 3,
    cancelReason: null,
    createdAt: '2026-10-06T10:00:00Z',
    items: [],
    kots: [],
    bills: [],
    mergedTables: [],
    subtotal: 0,
    ...partial,
  };
}
