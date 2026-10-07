import { describe, expect, it } from 'vitest';
import {
  expenseSchema,
  formatQuantity,
  parseQuantity,
  purchaseSchema,
  reportRangeSchema,
  stockAdjustSchema,
  stockCountSchema,
  stockItemSchema,
} from './back-office';

const ITEM_A = '11111111-1111-4111-8111-111111111111';
const ITEM_B = '22222222-2222-4222-8222-222222222222';

describe('parseQuantity', () => {
  it('reads whole and decimal quantities in thousandths', () => {
    expect(parseQuantity('1.5')).toBe(1500);
    expect(parseQuantity('0.250')).toBe(250);
    expect(parseQuantity('12')).toBe(12000);
    expect(parseQuantity(' 2 ')).toBe(2000);
    expect(parseQuantity('.5')).toBe(500);
  });

  it('refuses empty, zero, negative, too precise, non-numbers and huge amounts', () => {
    for (const bad of ['', '0', '0.000', '-1', '1.2345', 'abc', '1,5', '1000001']) {
      expect(parseQuantity(bad)).toBeNull();
    }
  });
});

describe('formatQuantity', () => {
  it('shows the shortest exact form', () => {
    expect(formatQuantity(1500)).toBe('1.5');
    expect(formatQuantity(250)).toBe('0.25');
    expect(formatQuantity(12000)).toBe('12');
    expect(formatQuantity(1)).toBe('0.001');
    expect(formatQuantity(-500)).toBe('-0.5');
    expect(formatQuantity(0)).toBe('0');
  });
});

describe('stock schemas', () => {
  it('needs a known unit and a non-negative minimum', () => {
    expect(
      stockItemSchema.safeParse({ name: 'Onion', unit: 'kg', minLevelMilli: 5000 }).success,
    ).toBe(true);
    expect(
      stockItemSchema.safeParse({ name: 'Onion', unit: 'sack', minLevelMilli: 0 }).success,
    ).toBe(false);
    expect(
      stockItemSchema.safeParse({ name: 'Onion', unit: 'kg', minLevelMilli: -1 }).success,
    ).toBe(false);
  });

  it('needs a non-zero adjustment with a reason, and a count of zero or more', () => {
    expect(stockAdjustSchema.safeParse({ qtyMilli: -500, reason: 'Spoiled' }).success).toBe(true);
    expect(stockAdjustSchema.safeParse({ qtyMilli: 0, reason: 'Spoiled' }).success).toBe(false);
    expect(stockAdjustSchema.safeParse({ qtyMilli: 500, reason: '' }).success).toBe(false);
    expect(stockCountSchema.safeParse({ countedMilli: 0 }).success).toBe(true);
    expect(stockCountSchema.safeParse({ countedMilli: -1 }).success).toBe(false);
  });
});

describe('purchaseSchema', () => {
  const purchase = {
    vendorName: 'Fresh Veg Traders',
    paidMode: 'CASH',
    lines: [{ stockItemId: ITEM_A, qtyMilli: 5000, amount: 20000 }],
  };

  it('accepts a cash purchase with lines', () => {
    expect(purchaseSchema.safeParse(purchase).success).toBe(true);
  });

  it('needs at least one line, positive amounts and each item once', () => {
    expect(purchaseSchema.safeParse({ ...purchase, lines: [] }).success).toBe(false);
    expect(
      purchaseSchema.safeParse({
        ...purchase,
        lines: [{ stockItemId: ITEM_A, qtyMilli: 0, amount: 100 }],
      }).success,
    ).toBe(false);
    const twice = purchaseSchema.safeParse({
      ...purchase,
      lines: [
        { stockItemId: ITEM_A, qtyMilli: 1000, amount: 100 },
        { stockItemId: ITEM_B, qtyMilli: 1000, amount: 100 },
        { stockItemId: ITEM_A, qtyMilli: 1000, amount: 100 },
      ],
    });
    expect(twice.success).toBe(false);
    expect(twice.error?.issues[0]?.message).toBe('Each item once per purchase');
    const huge = purchaseSchema.safeParse({
      ...purchase,
      lines: [
        { stockItemId: ITEM_A, qtyMilli: 1000, amount: 600_000_000 },
        { stockItemId: ITEM_B, qtyMilli: 1000, amount: 600_000_000 },
      ],
    });
    expect(huge.error?.issues[0]?.message).toMatch(/at most ₹1 crore/);
  });
});

describe('expenseSchema', () => {
  it('needs a category, a positive amount and a payment mode', () => {
    const expense = { categoryId: ITEM_A, amount: 50000, mode: 'UPI' };
    expect(expenseSchema.safeParse(expense).success).toBe(true);
    expect(expenseSchema.safeParse({ ...expense, amount: 0 }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...expense, mode: 'CHEQUE' }).success).toBe(false);
  });
});

describe('reportRangeSchema', () => {
  it('accepts up to 92 days in order', () => {
    expect(reportRangeSchema.safeParse({ from: '2026-10-01', to: '2026-10-01' }).success).toBe(
      true,
    );
    expect(reportRangeSchema.safeParse({ from: '2026-07-01', to: '2026-09-30' }).success).toBe(
      true,
    );
  });

  it('refuses a reversed range, a range over 92 days and bad dates', () => {
    expect(reportRangeSchema.safeParse({ from: '2026-10-02', to: '2026-10-01' }).success).toBe(
      false,
    );
    expect(reportRangeSchema.safeParse({ from: '2026-07-01', to: '2026-10-01' }).success).toBe(
      false,
    );
    expect(reportRangeSchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(
      false,
    );
  });
});
