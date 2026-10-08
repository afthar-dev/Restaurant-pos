import { describe, expect, it } from 'vitest';
import type { SalesReport } from '../types';
import { dayPoints, hourPoints } from './points';

const day = (dayId: string, date: string, total: number, bills: number) => ({
  dayId,
  date,
  status: 'CLOSED' as const,
  bills,
  total,
  cash: 0,
  upi: 0,
  card: 0,
  expenses: 0,
});

describe('chart points', () => {
  it('describes each day and marks the best one', () => {
    const points = dayPoints(
      [
        day('a', '2026-10-09', 1_000_000, 7),
        day('b', '2026-10-10', 0, 0),
        day('c', '2026-10-11', 1_825_000, 10),
      ],
      true,
    );
    expect(points.map((p) => p.detail)).toEqual([
      'Fri 9 Oct · ₹10,000 · 7 bills',
      'Sat 10 Oct · ₹0 · 0 bills',
      'Sun 11 Oct · ₹18,250 · 10 bills',
    ]);
    expect(points.map((p) => p.highlight)).toEqual([false, false, true]);
  });

  it('thins a month of day labels to every fourth', () => {
    const month: SalesReport['days'] = Array.from({ length: 31 }, (_, i) =>
      day(String(i), `2026-10-${String(i + 1).padStart(2, '0')}`, 100_000, 1),
    );
    const labels = dayPoints(month).map((p) => p.label);
    expect(labels.filter(Boolean)).toHaveLength(8);
    expect(labels[0]).toBe('Thu 1');
    expect(labels[1]).toBe('');
  });

  it('keeps hours continuous and a late night next to the evening', () => {
    const points = hourPoints([
      { hour: 0, bills: 2, total: 100_000 },
      { hour: 1, bills: 1, total: 50_000 },
      { hour: 22, bills: 5, total: 400_000 },
      { hour: 23, bills: 3, total: 200_000 },
    ]);
    expect(points.map((p) => p.detail.split(' · ')[0])).toEqual([
      '10pm–11pm',
      '11pm–12am',
      '12am–1am',
      '1am–2am',
    ]);
    const gap = hourPoints([
      { hour: 13, bills: 14, total: 840_000 },
      { hour: 15, bills: 3, total: 150_000 },
    ]);
    expect(gap.map((p) => p.detail)).toEqual([
      '1pm–2pm · ₹8,400 · 14 bills',
      '2pm–3pm · ₹0 · 0 bills',
      '3pm–4pm · ₹1,500 · 3 bills',
    ]);
  });
});
