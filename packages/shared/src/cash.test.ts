import { describe, expect, it } from 'vitest';
import { cashMovementSchema } from './cash';

describe('cashMovementSchema', () => {
  it('takes a positive amount and a reason that fits the type', () => {
    expect(
      cashMovementSchema.safeParse({ type: 'PAY_IN', amount: 50000, reasonCode: 'FLOAT_TOP_UP' })
        .success,
    ).toBe(true);
    expect(
      cashMovementSchema.safeParse({ type: 'DROP', amount: 500000, reasonCode: 'BANK' }).success,
    ).toBe(true);
    expect(
      cashMovementSchema.safeParse({ type: 'PAY_IN', amount: 0, reasonCode: 'OTHER', note: 'abc' })
        .success,
    ).toBe(false);
  });

  it('refuses a reason from another type, and OTHER without a note', () => {
    expect(
      cashMovementSchema.safeParse({ type: 'PAY_IN', amount: 100, reasonCode: 'SUPPLIER' }).success,
    ).toBe(false);
    expect(
      cashMovementSchema.safeParse({ type: 'PAY_OUT', amount: 100, reasonCode: 'OTHER' }).success,
    ).toBe(false);
    expect(
      cashMovementSchema.safeParse({
        type: 'PAY_OUT',
        amount: 100,
        reasonCode: 'OTHER',
        note: 'Gas refill',
      }).success,
    ).toBe(true);
  });
});
