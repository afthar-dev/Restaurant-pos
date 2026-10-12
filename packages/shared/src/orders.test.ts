import { describe, expect, it } from 'vitest';
import {
  addItemsSchema,
  cancelItemSchema,
  cancelOrderSchema,
  createOrderSchema,
  lineTotal,
  updateOrderItemSchema,
} from './orders';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('createOrderSchema', () => {
  it('accepts a dine-in order with a table and guests', () => {
    expect(createOrderSchema.parse({ type: 'DINE_IN', tableId: id(1), guests: 3 })).toEqual({
      type: 'DINE_IN',
      tableId: id(1),
      guests: 3,
    });
  });

  it('needs a table for dine-in but not for parcel', () => {
    expect(createOrderSchema.safeParse({ type: 'DINE_IN', guests: 2 }).success).toBe(false);
    expect(createOrderSchema.parse({ type: 'PARCEL' })).toEqual({ type: 'PARCEL' });
    expect(createOrderSchema.parse({ type: 'PARCEL', customerName: ' Ravi ' })).toEqual({
      type: 'PARCEL',
      customerName: 'Ravi',
    });
  });
});

describe('addItemsSchema', () => {
  const line = { variantId: id(2), quantity: 2, addonIds: [id(3)] };

  it('accepts lines with add-ons and an optional note', () => {
    expect(addItemsSchema.safeParse({ items: [{ ...line, note: 'less spicy' }] }).success).toBe(
      true,
    );
  });

  it('rejects a repeated add-on, zero quantity and an empty list', () => {
    expect(
      addItemsSchema.safeParse({ items: [{ ...line, addonIds: [id(3), id(3)] }] }).success,
    ).toBe(false);
    expect(addItemsSchema.safeParse({ items: [{ ...line, quantity: 0 }] }).success).toBe(false);
    expect(addItemsSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe('updateOrderItemSchema', () => {
  it('needs at least one change', () => {
    expect(updateOrderItemSchema.safeParse({}).success).toBe(false);
    expect(updateOrderItemSchema.parse({ quantity: 3 })).toEqual({ quantity: 3 });
    expect(updateOrderItemSchema.parse({ note: null })).toEqual({ note: null });
  });
});

describe('cancelItemSchema', () => {
  it('needs a real reason', () => {
    expect(cancelItemSchema.safeParse({ reason: '  ab ' }).success).toBe(false);
    expect(cancelItemSchema.parse({ reason: ' Customer changed mind ' })).toEqual({
      reason: 'Customer changed mind',
    });
  });
});

describe('lineTotal', () => {
  it('adds add-on prices to the unit price before multiplying', () => {
    expect(
      lineTotal({ unitPrice: 18000, addons: [{ price: 3000 }, { price: 0 }], quantity: 2 }),
    ).toBe(42000);
  });
});

describe('cancel reason codes', () => {
  it('takes a code, and OTHER needs a note', () => {
    expect(cancelItemSchema.parse({ reasonCode: 'WRONG_DISH' })).toEqual({
      reasonCode: 'WRONG_DISH',
    });
    expect(cancelItemSchema.safeParse({ reasonCode: 'OTHER' }).success).toBe(false);
    expect(cancelItemSchema.safeParse({}).success).toBe(false);
    expect(cancelOrderSchema.safeParse({ reasonCode: 'LONG_WAIT' }).success).toBe(true);
    expect(cancelOrderSchema.safeParse({ reasonCode: 'NOPE' }).success).toBe(false);
  });
});
