import { describe, expect, it } from 'vitest';
import {
  billCount,
  dayLabel,
  hourLabel,
  hourRange,
  niceMax,
  shortDayLabel,
  shortRupees,
} from './scale';

describe('chart scale', () => {
  it('rounds the axis top up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect([0, 1, 7, 250, 12_340, 99_000, 12_345_600].map(niceMax)).toEqual([
      0, 1, 10, 250, 20_000, 100_000, 20_000_000,
    ]);
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
