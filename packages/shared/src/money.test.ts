import { describe, expect, it } from 'vitest';
import { formatPaise, rupeesToPaise } from './money';

describe('rupeesToPaise', () => {
  it('converts whole and fractional rupees to integer paise', () => {
    expect(rupeesToPaise(0)).toBe(0);
    expect(rupeesToPaise(1)).toBe(100);
    expect(rupeesToPaise(320.5)).toBe(32050);
  });

  it('absorbs binary floating point error', () => {
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(rupeesToPaise(0.29)).toBe(29);
  });

  it('rounds negatives symmetrically and never returns negative zero', () => {
    expect(rupeesToPaise(-12.345)).toBe(-1235);
    expect(Object.is(rupeesToPaise(-0), 0)).toBe(true);
    expect(Object.is(rupeesToPaise(-0.001), 0)).toBe(true);
  });

  it('rejects non-finite input', () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow(RangeError);
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('formatPaise', () => {
  it('formats with Indian digit grouping and two decimals', () => {
    expect(formatPaise(12345678)).toBe('₹1,23,456.78');
    expect(formatPaise(63300)).toBe('₹633.00');
    expect(formatPaise(0)).toBe('₹0.00');
  });

  it('formats negative amounts', () => {
    expect(formatPaise(-50000)).toBe('-₹500.00');
  });

  it('rejects fractional or unsafe paise', () => {
    expect(() => formatPaise(10.5)).toThrow(RangeError);
    expect(() => formatPaise(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});
