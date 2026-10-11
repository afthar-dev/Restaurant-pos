import { describe, expect, it } from 'vitest';
import { kotReprintSchema, reasonLabel } from './reasons';

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
