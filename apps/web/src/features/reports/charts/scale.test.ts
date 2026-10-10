import { describe, expect, it } from 'vitest';
import {
  billCount,
  dayLabel,
  hourLabel,
  hourRange,
  niceTicks,
  percentShares,
  shortDayLabel,
  shortRupees,
} from './scale';

describe('chart scale', () => {
  it('puts axis ticks on 1, 2 or 5 times a power of ten', () => {
    expect(niceTicks(0)).toEqual([0]);
    // ₹26,546 → steps of ₹10k, not ₹33.3k thirds.
    expect(niceTicks(2_654_600)).toEqual([0, 1_000_000, 2_000_000, 3_000_000]);
    // ₹14,794 → ₹5k steps.
    expect(niceTicks(1_479_400)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    // Exactly on a step: no extra empty tick above.
    expect(niceTicks(2_000_000)).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
  });

  it('writes short rupee amounts for axes', () => {
    expect(
      [0, 85_000, 1_200_000, 1_250_000, 12_000_000, 250_000_000, 2_000_000_000].map(shortRupees),
    ).toEqual(['₹0', '₹850', '₹12k', '₹12.5k', '₹1.2L', '₹25L', '₹2Cr']);
  });

  it('names hours and days', () => {
    expect([0, 9, 12, 13, 23].map(hourLabel)).toEqual(['12am', '9am', '12pm', '1pm', '11pm']);
    expect(hourRange(13)).toBe('1pm–2pm');
    expect(hourRange(23)).toBe('11pm–12am');
    expect(dayLabel('2026-10-11')).toBe('Sun 11 Oct');
    expect(shortDayLabel('2026-10-11')).toBe('Sun 11');
    expect([1, 3].map(billCount)).toEqual(['1 bill', '3 bills']);
  });
});

describe('percentShares', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it('adds up to exactly 100 where plain rounding gives 99', () => {
    expect(percentShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(percentShares([100, 100, 100])).toEqual([34, 33, 33]);
  });

  it('adds up to exactly 100 where plain rounding gives 101', () => {
    expect(sum(percentShares([5, 5, 5, 5, 5, 5, 5]))).toBe(100);
    // 12.5 + 12.5 + 75 → Math.round gives 13 + 13 + 75 = 101
    expect(percentShares([1, 1, 6])).toEqual([13, 12, 75]);
  });

  it('keeps clean splits and handles zeros', () => {
    expect(percentShares([500, 1000, 0])).toEqual([33, 67, 0]);
    expect(percentShares([0, 900, 0])).toEqual([0, 100, 0]);
    expect(percentShares([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
