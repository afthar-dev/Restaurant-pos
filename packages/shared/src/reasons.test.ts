import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CANCEL_REASONS,
  DISCOUNT_REASONS,
  VOID_REASONS,
  kotReprintSchema,
  reasonLabel,
  reasonRequestFields,
  refineReason,
  resolveReason,
} from './reasons';

describe('reasonLabel', () => {
  it('names a KOT reprint reason, and falls back to the code for an unknown one', () => {
    expect(reasonLabel('kotReprint', 'PRINTER_JAM')).toBe('Printer jam');
    expect(reasonLabel('kotReprint', 'KITCHEN_LOST')).toBe('Kitchen lost it');
    expect(reasonLabel('kotReprint', 'OTHER')).toBe('Other');
    expect(reasonLabel('kotReprint', 'SOMETHING_OLD')).toBe('SOMETHING_OLD');
  });
});

describe('kotReprintSchema', () => {
  it('needs a known code, and a note for OTHER', () => {
    expect(kotReprintSchema.safeParse({}).success).toBe(false);
    expect(kotReprintSchema.safeParse({ reasonCode: 'NOPE' }).success).toBe(false);
    expect(kotReprintSchema.safeParse({ reasonCode: 'OTHER' }).success).toBe(false);
    expect(kotReprintSchema.safeParse({ reasonCode: 'OTHER', note: '  ' }).success).toBe(false);
    expect(kotReprintSchema.safeParse({ reasonCode: 'OTHER', note: 'Ink ran out' }).success).toBe(
      true,
    );
    expect(kotReprintSchema.safeParse({ reasonCode: 'PRINTER_JAM' }).success).toBe(true);
  });
});

describe('discount, void and cancel reasons', () => {
  it('lists the codes and names each one', () => {
    expect(DISCOUNT_REASONS).toEqual([
      'REGULAR',
      'COMPLAINT',
      'COMPLIMENTARY',
      'STAFF_MEAL',
      'MANAGER_OFFER',
      'OTHER',
    ]);
    expect(VOID_REASONS).toEqual([
      'WRONG_ORDER',
      'CUSTOMER_LEFT',
      'DUPLICATE',
      'PAYMENT_ISSUE',
      'OTHER',
    ]);
    expect(CANCEL_REASONS).toEqual([
      'CHANGED_MIND',
      'OUT_OF_STOCK',
      'WRONG_DISH',
      'LONG_WAIT',
      'OTHER',
    ]);
    expect(reasonLabel('discount', 'STAFF_MEAL')).toBe('Staff meal');
    expect(reasonLabel('void', 'DUPLICATE')).toBe('Duplicate bill');
    expect(reasonLabel('cancel', 'CHANGED_MIND')).toBe('Customer changed mind');
    expect(reasonLabel('cancel', 'OLD')).toBe('OLD');
  });

  it('fills the free-text column with the note, else the label, else the legacy text', () => {
    expect(resolveReason('void', { reasonCode: 'DUPLICATE' })).toEqual({
      code: 'DUPLICATE',
      text: 'Duplicate bill',
    });
    expect(resolveReason('void', { reasonCode: 'OTHER', note: ' Fire alarm ' })).toEqual({
      code: 'OTHER',
      text: 'Fire alarm',
    });
    expect(resolveReason('void', { reason: ' Wrong table ' })).toEqual({
      code: 'OTHER',
      text: 'Wrong table',
    });
    expect(resolveReason('void', {})).toBeNull();
  });

  it('needs a note for OTHER, and a code or older text when required', () => {
    const schema = refineReason(z.strictObject(reasonRequestFields(VOID_REASONS)), true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ reasonCode: 'OTHER' }).success).toBe(false);
    expect(schema.safeParse({ reasonCode: 'OTHER', note: 'ab' }).success).toBe(false);
    expect(schema.safeParse({ reasonCode: 'OTHER', note: 'Fire alarm' }).success).toBe(true);
    expect(schema.safeParse({ reasonCode: 'NOPE' }).success).toBe(false);
    expect(schema.safeParse({ reasonCode: 'DUPLICATE' }).success).toBe(true);
    expect(schema.safeParse({ reason: 'Wrong table' }).success).toBe(true);
    expect(schema.safeParse({ reason: 'ab' }).success).toBe(false);
  });
});
