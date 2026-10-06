import { describe, expect, it } from 'vitest';
import {
  createUserSchema,
  gstinSchema,
  outletSettingsSchema,
  phoneSchema,
  pinSchema,
  updateUserSchema,
} from './schemas';

describe('phoneSchema', () => {
  it('accepts a 10-digit Indian mobile number', () => {
    expect(phoneSchema.parse('9876543210')).toBe('9876543210');
  });

  it.each(['1234567890', '98765', '+919876543210', '98765 43210'])('rejects %s', (value) => {
    expect(phoneSchema.safeParse(value).success).toBe(false);
  });
});

describe('pinSchema', () => {
  it.each(['1234', '123456'])('accepts %s', (value) => {
    expect(pinSchema.parse(value)).toBe(value);
  });

  it.each(['123', '1234567', '12a4'])('rejects %s', (value) => {
    expect(pinSchema.safeParse(value).success).toBe(false);
  });
});

describe('gstinSchema', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(gstinSchema.parse('29ABCDE1234F1Z5')).toBe('29ABCDE1234F1Z5');
  });

  it.each(['29abcde1234f1z5', '29ABCDE1234F1Z'])('rejects %s', (value) => {
    expect(gstinSchema.safeParse(value).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  const base = { name: 'Ravi', phone: '9876543210' };

  it('requires a password for owners and managers', () => {
    expect(createUserSchema.safeParse({ ...base, role: 'MANAGER', pin: '1234' }).success).toBe(
      false,
    );
    expect(
      createUserSchema.safeParse({ ...base, role: 'MANAGER', password: 'secret-pass' }).success,
    ).toBe(true);
  });

  it('requires a PIN for cashiers and waiters', () => {
    expect(
      createUserSchema.safeParse({ ...base, role: 'CASHIER', password: 'secret-pass' }).success,
    ).toBe(false);
    expect(createUserSchema.safeParse({ ...base, role: 'WAITER', pin: '4321' }).success).toBe(true);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(createUserSchema.safeParse({ ...base, role: 'OWNER', password: 'short' }).success).toBe(
      false,
    );
  });

  it('trims the name and rejects a blank one', () => {
    expect(
      createUserSchema.parse({ ...base, name: '  Ravi  ', role: 'WAITER', pin: '1234' }).name,
    ).toBe('Ravi');
    expect(
      createUserSchema.safeParse({ ...base, name: '   ', role: 'WAITER', pin: '1234' }).success,
    ).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('allows clearing a PIN with null', () => {
    expect(updateUserSchema.parse({ pin: null })).toEqual({ pin: null });
  });
});

describe('outletSettingsSchema', () => {
  it('accepts a partial update', () => {
    expect(outletSettingsSchema.parse({ cashierDiscountCapBp: 1500 })).toEqual({
      cashierDiscountCapBp: 1500,
    });
  });

  it('rejects a discount cap above 100%', () => {
    expect(outletSettingsSchema.safeParse({ cashierDiscountCapBp: 10001 }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(outletSettingsSchema.safeParse({ hacked: true }).success).toBe(false);
  });

  it('allows clearing the GSTIN with null', () => {
    expect(outletSettingsSchema.parse({ gstin: null })).toEqual({ gstin: null });
  });
});

describe('bill packaging setting', () => {
  it('takes a charge in paise and refuses a negative one', () => {
    expect(outletSettingsSchema.parse({ billPackagingCharge: 1000 })).toEqual({
      billPackagingCharge: 1000,
    });
    expect(outletSettingsSchema.safeParse({ billPackagingCharge: -1 }).success).toBe(false);
  });
});
