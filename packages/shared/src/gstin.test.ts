import { describe, expect, it } from 'vitest';
import { COMPOSITION_RESTAURANT_RATE_BP, gstinSchema, isValidGstin } from './gstin';

describe('isValidGstin', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
  });

  it.each(['27AAPFU0939F1Z', '27AAPFU0939F1ZVV'])('rejects the wrong length %s', (value) => {
    expect(isValidGstin(value)).toBe(false);
  });

  it.each(['00AAPFU0939F1ZV', '39AAPFU0939F1ZV'])('rejects state code in %s', (value) => {
    expect(isValidGstin(value)).toBe(false);
  });

  it('rejects a bad pattern', () => {
    expect(isValidGstin('27AAPFU0939F1Z@')).toBe(false);
  });
});

describe('gstinSchema', () => {
  it('uppercases and trims before checking', () => {
    expect(gstinSchema.parse('  27aapfu0939f1zv ')).toBe('27AAPFU0939F1ZV');
  });

  it('rejects an invalid GSTIN with a message', () => {
    const result = gstinSchema.safeParse('27AAPFU0939F1Z');
    expect(result.success).toBe(false);
  });
});

describe('COMPOSITION_RESTAURANT_RATE_BP', () => {
  it('is 5 percent in basis points', () => {
    expect(COMPOSITION_RESTAURANT_RATE_BP).toBe(500);
  });
});
