import { describe, expect, it } from 'vitest';
import { addPaymentSchema, changePaymentModeSchema } from './billing';
import { outletSettingsSchema } from './schemas';
import { upiLink, vpaSchema } from './upi';

describe('vpaSchema', () => {
  it.each(['spicegarden@okicici', 'a.b-c_d@ybl', 'ab@upi', '9876543210@paytm'])(
    'accepts %s',
    (value) => {
      expect(vpaSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each(['', 'spicegarden', '@okicici', 'a@ok', 'a@1bank', 'sp ice@okicici', 'a@b@c', 'x@bank!'])(
    'rejects %j',
    (value) => {
      expect(vpaSchema.safeParse(value).success).toBe(false);
    },
  );

  it('trims surrounding spaces', () => {
    expect(vpaSchema.parse('  spicegarden@okicici ')).toBe('spicegarden@okicici');
  });
});

describe('upiLink', () => {
  it('writes the amount with two decimals and URL-encodes the payee and note', () => {
    expect(
      upiLink({
        vpa: 'spicegarden@okicici',
        payee: 'Spice Garden',
        amountPaise: 24200,
        note: 'Bill 135',
      }),
    ).toBe('upi://pay?pa=spicegarden%40okicici&pn=Spice%20Garden&am=242.00&cu=INR&tn=Bill%20135');
  });

  it('keeps paise and encodes reserved characters', () => {
    expect(upiLink({ vpa: 'a@upi', payee: "Tom & Jerry's", amountPaise: 5, note: 'Bill #7' })).toBe(
      "upi://pay?pa=a%40upi&pn=Tom%20%26%20Jerry's&am=0.05&cu=INR&tn=Bill%20%237",
    );
  });

  it('leaves out the note when there is none', () => {
    expect(upiLink({ vpa: 'a@upi', payee: 'Cafe', amountPaise: 10050 })).toBe(
      'upi://pay?pa=a%40upi&pn=Cafe&am=100.50&cu=INR',
    );
  });
});

describe('payment reference', () => {
  const base = { mode: 'UPI', amount: 100 } as const;

  it('accepts 6 to 22 letters and digits', () => {
    expect(addPaymentSchema.safeParse({ ...base, reference: 'AB12CD' }).success).toBe(true);
    expect(addPaymentSchema.safeParse({ ...base, reference: 'A'.repeat(22) }).success).toBe(true);
  });

  it.each(['AB12C', 'A'.repeat(23), 'AB 12CD', 'AB-12CD'])('rejects %j', (reference) => {
    expect(addPaymentSchema.safeParse({ ...base, reference }).success).toBe(false);
  });

  it('treats a blank reference as none', () => {
    expect(addPaymentSchema.parse({ ...base, reference: '  ' }).reference).toBeUndefined();
  });
});

describe('changePaymentModeSchema', () => {
  it('needs a mode and a reason code, and a note for OTHER', () => {
    expect(changePaymentModeSchema.safeParse({ mode: 'UPI' }).success).toBe(false);
    expect(changePaymentModeSchema.safeParse({ mode: 'UPI', reasonCode: 'NOPE' }).success).toBe(
      false,
    );
    expect(
      changePaymentModeSchema.safeParse({ mode: 'UPI', reasonCode: 'WRONG_MODE' }).success,
    ).toBe(true);
    expect(changePaymentModeSchema.safeParse({ mode: 'UPI', reasonCode: 'OTHER' }).success).toBe(
      false,
    );
    expect(
      changePaymentModeSchema.safeParse({ mode: 'CARD', reasonCode: 'OTHER', note: 'Split tender' })
        .success,
    ).toBe(true);
  });
});

describe('outlet UPI settings', () => {
  it('validates the UPI ID and lets it be cleared', () => {
    expect(outletSettingsSchema.safeParse({ upiVpa: 'spicegarden@okicici' }).success).toBe(true);
    expect(outletSettingsSchema.safeParse({ upiVpa: 'nope' }).success).toBe(false);
    expect(outletSettingsSchema.parse({ upiVpa: null }).upiVpa).toBeNull();
    expect(outletSettingsSchema.parse({ upiVpa: '' }).upiVpa).toBeNull();
    expect(outletSettingsSchema.safeParse({ upiPayee: 'x'.repeat(101) }).success).toBe(false);
    expect(outletSettingsSchema.safeParse({ printUpiQr: false }).success).toBe(true);
  });
});
