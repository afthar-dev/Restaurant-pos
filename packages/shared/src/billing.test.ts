import { describe, expect, it } from 'vitest';
import {
  addPaymentSchema,
  billDiscountSchema,
  closeDaySchema,
  createBillSchema,
  discountSchema,
  reopenDaySchema,
  splitEqually,
  voidBillSchema,
} from './billing';

const ID = '00000000-0000-4000-8000-000000000001';

describe('splitEqually', () => {
  it('gives the spare paise to the first parts so the parts add up', () => {
    expect(splitEqually(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEqually(10001, 2)).toEqual([5001, 5000]);
    expect(splitEqually(900, 3)).toEqual([300, 300, 300]);
  });

  it('refuses nonsense splits', () => {
    expect(() => splitEqually(100, 0)).toThrow();
    expect(() => splitEqually(100, 21)).toThrow();
    expect(() => splitEqually(2, 3)).toThrow();
  });
});

describe('discountSchema', () => {
  it('takes a flat amount in paise or a percentage in basis points', () => {
    expect(discountSchema.parse({ kind: 'FLAT', value: 5000 })).toEqual({
      kind: 'FLAT',
      value: 5000,
    });
    expect(discountSchema.parse({ kind: 'PERCENT', value: 1000 }).value).toBe(1000);
  });

  it('refuses more than 100%', () => {
    expect(discountSchema.safeParse({ kind: 'PERCENT', value: 10001 }).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('bills everything when no lines are given, or chosen lines with quantities', () => {
    expect(createBillSchema.parse({})).toEqual({});
    expect(
      createBillSchema.parse({ lines: [{ orderItemId: ID, quantity: 2 }] }).lines,
    ).toHaveLength(1);
    expect(createBillSchema.safeParse({ lines: [] }).success).toBe(false);
  });

  it('needs a payment amount above zero and a known mode', () => {
    expect(addPaymentSchema.safeParse({ mode: 'CASH', amount: 0 }).success).toBe(false);
    expect(addPaymentSchema.safeParse({ mode: 'CHEQUE', amount: 100 }).success).toBe(false);
    expect(
      addPaymentSchema.parse({ mode: 'UPI', amount: 100, reference: ' 123456 ' }).reference,
    ).toBe('123456');
  });

  it('sets bill and item discounts together', () => {
    const parsed = billDiscountSchema.parse({
      bill: { kind: 'PERCENT', value: 500 },
      reason: 'Regular',
    });
    expect(parsed.items).toEqual([]);
  });

  it('needs counted cash to close the day and a reason to reopen it', () => {
    expect(closeDaySchema.safeParse({}).success).toBe(false);
    expect(closeDaySchema.parse({ countedCash: 150000 })).toEqual({ countedCash: 150000 });
    expect(reopenDaySchema.safeParse({ reason: 'x' }).success).toBe(false);
  });
});

describe('discount and void reason codes', () => {
  it('takes a code and note, or the older free text', () => {
    expect(billDiscountSchema.safeParse({ bill: null, reasonCode: 'COMPLIMENTARY' }).success).toBe(
      true,
    );
    expect(billDiscountSchema.safeParse({ reasonCode: 'OTHER' }).success).toBe(false);
    expect(billDiscountSchema.safeParse({ reasonCode: 'NOPE' }).success).toBe(false);
    expect(voidBillSchema.safeParse({ reasonCode: 'DUPLICATE' }).success).toBe(true);
    expect(voidBillSchema.safeParse({ reasonCode: 'OTHER', note: 'Fire alarm' }).success).toBe(
      true,
    );
    expect(voidBillSchema.safeParse({ reason: 'Wrong table' }).success).toBe(true);
    expect(voidBillSchema.safeParse({}).success).toBe(false);
  });
});
