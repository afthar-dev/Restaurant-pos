import type { Menu, MenuItem } from '@/features/menu';
import type { Bill } from '@/features/billing';
import type { Order, OrderLine, QrRequest } from '@/features/orders';

const tax = { id: 'tax', name: 'GST 5%', cgstBp: 250, sgstBp: 250 };

function item(partial: Partial<MenuItem> & Pick<MenuItem, 'id' | 'name' | 'variants'>): MenuItem {
  return {
    categoryId: 'c1',
    description: null,
    foodType: 'VEG',
    isAvailable: true,
    isCombo: false,
    imageUrl: null,
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
    qrPending: [],
    subtotal: 0,
    ...partial,
  };
}

/** An unpaid tax invoice for 2 × Paneer Tikka Half with cheese + 1 × Roti: ₹450 + 5% → ₹473. */
export function bill(partial: Partial<Bill> = {}): Bill {
  return {
    id: 'b1',
    billNo: 12,
    financialYear: '2026-27',
    status: 'OPEN',
    title: 'Tax Invoice',
    orderId: 'o1',
    orderType: 'DINE_IN',
    tableName: 'T1',
    tokenNo: null,
    lines: [
      {
        id: 'bl1',
        orderItemId: 'l1',
        itemName: 'Paneer Tikka',
        variantName: 'Half',
        addons: [{ name: 'Cheese', price: 3000 }],
        unitPrice: 21000,
        quantity: 2,
        gross: 42000,
        discount: null,
        itemDiscount: 0,
        lineTotal: 42000,
      },
      {
        id: 'bl2',
        orderItemId: 'l2',
        itemName: 'Tandoori Roti',
        variantName: 'Regular',
        addons: [],
        unitPrice: 3000,
        quantity: 1,
        gross: 3000,
        discount: null,
        itemDiscount: 0,
        lineTotal: 3000,
      },
    ],
    grossSubtotal: 45000,
    itemDiscount: 0,
    subtotal: 45000,
    discount: null,
    billDiscount: 0,
    discountReason: null,
    packaging: 0,
    taxable: 45000,
    exempt: 0,
    cgst: 1125,
    sgst: 1125,
    taxBreakup: [{ cgstBp: 250, sgstBp: 250, taxable: 45000, cgst: 1125, sgst: 1125 }],
    roundOff: 50,
    total: 47300,
    paid: 0,
    due: 47300,
    payments: [],
    voidReason: null,
    version: 4,
    createdAt: '2026-10-06T14:12:00.000Z',
    createdBy: { id: 'c', name: 'Kavya' },
    ...partial,
  };
}

/** 2 × Paneer Tikka Half with cheese and 1 × Roti, asked for from T1's QR. */
export function qrRequest(partial: Partial<QrRequest> = {}): QrRequest {
  return {
    id: 'q1',
    orderId: 'o1',
    tableName: 'T1',
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    lines: [
      {
        variantId: 'paneer-h',
        addonIds: ['cheese'],
        quantity: 2,
        note: null,
        itemName: 'Paneer Tikka',
        variantName: 'Half',
        addons: ['Cheese'],
        amount: 42000,
      },
      {
        variantId: 'roti-r',
        addonIds: [],
        quantity: 1,
        note: 'extra crisp',
        itemName: 'Tandoori Roti',
        variantName: 'Regular',
        addons: [],
        amount: 3000,
      },
    ],
    note: 'peanut allergy',
    total: 45000,
    blocked: null,
    ...partial,
  };
}
