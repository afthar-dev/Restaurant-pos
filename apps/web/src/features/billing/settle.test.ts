import { describe, expect, it } from 'vitest';
import { cashOutcome, suggestNotes } from './settle';

describe('suggestNotes', () => {
  it('rounds up to the next ₹50, ₹100 and ₹500, then big notes', () => {
    expect(suggestNotes(117000)).toEqual([120000, 150000, 200000]);
    expect(suggestNotes(4000)).toEqual([5000, 10000, 50000]);
    expect(suggestNotes(47300)).toEqual([50000, 200000]);
  });

  it('never suggests the exact amount', () => {
    expect(suggestNotes(120000)).toEqual([125000, 130000, 150000]);
  });

  it('handles paise and nothing due', () => {
    expect(suggestNotes(47350)).toEqual([50000, 200000]);
    expect(suggestNotes(0)).toEqual([]);
  });
});

describe('cashOutcome', () => {
  it('gives change or the shortfall', () => {
    expect(cashOutcome(47300, 50000)).toEqual({ change: 2700 });
    expect(cashOutcome(47300, 47300)).toEqual({ change: 0 });
    expect(cashOutcome(73200, 50000)).toEqual({ short: 23200 });
  });
});
