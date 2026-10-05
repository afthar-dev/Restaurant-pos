import { describe, expect, it } from 'vitest';
import {
  addonGroupSchema,
  itemSchema,
  paiseToRupeesInput,
  parseRupees,
  printerSchema,
  taxRateSchema,
} from './menu';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('parseRupees', () => {
  it.each([
    ['120', 12000],
    ['120.5', 12050],
    ['120.50', 12050],
    ['₹1,200.75', 120075],
    [' 0.1 ', 10],
    ['0', 0],
  ])('reads %s as %d paise', (input, paise) => {
    expect(parseRupees(input)).toBe(paise);
  });

  it.each(['12.345', '-5', 'abc', '', '1.2.3', '10000001'])('rejects %s', (input) => {
    expect(parseRupees(input)).toBeNull();
  });
});

describe('paiseToRupeesInput', () => {
  it('drops zero paise and keeps two decimals otherwise', () => {
    expect(paiseToRupeesInput(12000)).toBe('120');
    expect(paiseToRupeesInput(12050)).toBe('120.50');
    expect(paiseToRupeesInput(5)).toBe('0.05');
  });
});

const baseItem = {
  categoryId: uuid(1),
  name: 'Paneer Tikka',
  foodType: 'VEG',
  taxRateId: uuid(2),
  variants: [{ name: 'Regular', dineInPrice: 32000 }],
  addonGroupIds: [],
  isCombo: false,
  components: [],
};

describe('itemSchema', () => {
  it('accepts a simple item and leaves parcel price optional', () => {
    const parsed = itemSchema.parse(baseItem);
    expect(parsed.variants[0]).toEqual({ name: 'Regular', dineInPrice: 32000 });
  });

  it('needs at least one variant', () => {
    expect(itemSchema.safeParse({ ...baseItem, variants: [] }).success).toBe(false);
  });

  it('rejects duplicate variant names regardless of case', () => {
    const variants = [
      { name: 'Half', dineInPrice: 100 },
      { name: 'half', dineInPrice: 200 },
    ];
    expect(itemSchema.safeParse({ ...baseItem, variants }).success).toBe(false);
  });

  it('requires components for a combo and none otherwise', () => {
    expect(itemSchema.safeParse({ ...baseItem, isCombo: true }).success).toBe(false);
    expect(
      itemSchema.safeParse({
        ...baseItem,
        components: [{ variantId: uuid(3), quantity: 1 }],
      }).success,
    ).toBe(false);
    expect(
      itemSchema.safeParse({
        ...baseItem,
        isCombo: true,
        components: [{ variantId: uuid(3), quantity: 2 }],
      }).success,
    ).toBe(true);
  });

  it('rejects negative or fractional prices', () => {
    for (const dineInPrice of [-1, 10.5]) {
      expect(
        itemSchema.safeParse({ ...baseItem, variants: [{ name: 'R', dineInPrice }] }).success,
      ).toBe(false);
    }
  });
});

describe('addonGroupSchema', () => {
  const addons = [
    { name: 'Extra cheese', price: 3000 },
    { name: 'Less spicy', price: 0 },
  ];

  it('accepts a sensible group', () => {
    expect(
      addonGroupSchema.safeParse({ name: 'Extras', minSelect: 0, maxSelect: 2, addons }).success,
    ).toBe(true);
  });

  it('rejects min above max and max above the number of add-ons', () => {
    expect(
      addonGroupSchema.safeParse({ name: 'X', minSelect: 2, maxSelect: 1, addons }).success,
    ).toBe(false);
    expect(
      addonGroupSchema.safeParse({ name: 'X', minSelect: 0, maxSelect: 3, addons }).success,
    ).toBe(false);
  });
});

describe('printerSchema', () => {
  it('needs a station for a KOT printer and an address for agent mode', () => {
    const base = { name: 'Kitchen printer', mode: 'BROWSER', paperWidthMm: 80 };
    expect(printerSchema.safeParse({ ...base, purpose: 'KOT' }).success).toBe(false);
    expect(printerSchema.safeParse({ ...base, purpose: 'KOT', stationId: uuid(1) }).success).toBe(
      true,
    );
    expect(printerSchema.safeParse({ ...base, purpose: 'BILL', mode: 'AGENT' }).success).toBe(
      false,
    );
  });
});

describe('taxRateSchema', () => {
  it('accepts an even total in basis points and rejects odd ones', () => {
    expect(taxRateSchema.safeParse({ name: 'GST 18%', totalBp: 1800 }).success).toBe(true);
    expect(taxRateSchema.safeParse({ name: 'Odd', totalBp: 501 }).success).toBe(false);
    expect(taxRateSchema.safeParse({ name: 'Too much', totalBp: 3000 }).success).toBe(false);
  });
});
