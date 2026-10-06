import { allocate, calculateBill, discountOn, type CalcInput, type CalcLine } from './bill-calc';

const gst5 = { cgstBp: 250, sgstBp: 250 };
const line = (unitPrice: number, quantity = 1, extra: Partial<CalcLine> = {}): CalcLine => ({
  unitPrice,
  quantity,
  packagingPerUnit: 0,
  discount: null,
  ...gst5,
  ...extra,
});
const bill = (lines: CalcLine[], extra: Partial<CalcInput> = {}) =>
  calculateBill({ lines, billDiscount: null, billPackaging: 0, taxScheme: 'REGULAR', ...extra });

describe('discountOn', () => {
  it('takes flat paise or basis points, never more than the base', () => {
    expect(discountOn(20000, null)).toBe(0);
    expect(discountOn(20000, { kind: 'FLAT', value: 5000 })).toBe(5000);
    expect(discountOn(20000, { kind: 'FLAT', value: 50000 })).toBe(20000);
    expect(discountOn(20000, { kind: 'PERCENT', value: 1000 })).toBe(2000);
    expect(discountOn(333, { kind: 'PERCENT', value: 5000 })).toBe(167); // 166.5 rounds half up
    expect(discountOn(20000, { kind: 'PERCENT', value: 15000 })).toBe(20000);
  });
});

describe('allocate', () => {
  it('splits by weight and always adds up exactly', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(1000, [30000, 10000])).toEqual([750, 250]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(10, [0, 0])).toEqual([5, 5]);
    expect(allocate(10, [])).toEqual([]);
    const shares = allocate(9999, [12345, 6789, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(9999);
  });
});

describe('calculateBill', () => {
  it('adds 2.5% CGST and SGST per line and rounds the total to the rupee', () => {
    // 2 × ₹180 + 1 × ₹30 = ₹390; tax 2.5% each = ₹9.75 + ₹9.75; ₹409.50 → ₹410, round off +₹0.50
    const r = bill([line(18000, 2), line(3000)]);
    expect(r.subtotal).toBe(39000);
    expect(r.cgst).toBe(975);
    expect(r.sgst).toBe(975);
    expect(r.taxable).toBe(39000);
    expect(r.total).toBe(41000);
    expect(r.roundOff).toBe(50);
  });

  it('rounds tax to paise per line, not on the bill total', () => {
    // each ₹10.10 line: 2.5% = 25.25 paise → 25 per line (75), not 75.75 → 76 on the total
    const r = bill([line(1010), line(1010), line(1010)]);
    expect(r.cgst).toBe(75);
  });

  it('rounds the total down when the paise are under 50', () => {
    const r = bill([line(10010)]); // ₹100.10 + ₹2.50 + ₹2.50 = ₹105.10 → ₹105
    expect(r.total).toBe(10500);
    expect(r.roundOff).toBe(-10);
  });

  it('takes item discounts before the bill discount and spreads the bill discount by line', () => {
    const r = bill([line(30000, 1, { discount: { kind: 'FLAT', value: 10000 } }), line(10000)], {
      billDiscount: { kind: 'PERCENT', value: 1000 },
    });
    expect(r.grossSubtotal).toBe(40000);
    expect(r.itemDiscount).toBe(10000);
    expect(r.subtotal).toBe(30000);
    expect(r.billDiscount).toBe(3000);
    expect(r.lines.map((l) => l.billDiscountShare)).toEqual([2000, 1000]);
    expect(r.taxable).toBe(27000);
    expect(r.lines.map((l) => l.taxable)).toEqual([18000, 9000]);
  });

  it('clamps a discount bigger than the bill to zero, never negative', () => {
    const r = bill([line(20000)], { billDiscount: { kind: 'FLAT', value: 50000 } });
    expect(r.billDiscount).toBe(20000);
    expect(r.taxable).toBe(0);
    expect(r.total).toBe(0);
    expect(r.roundOff).toBe(0);
  });

  it('adds parcel packaging per unit plus bill packaging, and taxes it with the line', () => {
    const r = bill([line(33000, 2, { packagingPerUnit: 1000 }), line(3000)], {
      billPackaging: 1000,
    });
    expect(r.packaging).toBe(3000);
    expect(r.lines.map((l) => l.packaging)).toEqual([2000 + 957, 43]);
    expect(r.taxable).toBe(69000 + 3000);
  });

  it('charges no tax under the composition scheme or without GST', () => {
    for (const taxScheme of ['COMPOSITION', 'NONE'] as const) {
      const r = bill([line(18000, 2)], { taxScheme });
      expect(r.cgst + r.sgst).toBe(0);
      expect(r.total).toBe(36000);
      expect(r.taxBreakup).toEqual([]);
    }
  });

  it('groups tax by rate for the bill footer', () => {
    const r = bill([line(10000), line(10000, 1, { cgstBp: 900, sgstBp: 900 }), line(20000)]);
    expect(r.taxBreakup).toEqual([
      { cgstBp: 250, sgstBp: 250, taxable: 30000, cgst: 750, sgst: 750 },
      { cgstBp: 900, sgstBp: 900, taxable: 10000, cgst: 900, sgst: 900 },
    ]);
  });

  it('refuses an empty bill', () => {
    expect(() => bill([])).toThrow('A bill needs at least one line');
  });
});
