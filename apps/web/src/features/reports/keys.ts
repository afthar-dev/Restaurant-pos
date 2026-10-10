import type { DateRange } from './ranges';

export const reportKeys = {
  /** Every sales report, for invalidating them all. */
  all: ['reports'] as const,
  sales: (range: DateRange) => ['reports', 'sales', range.from, range.to] as const,
  day: (dayId: string) => ['reports', 'sales', 'day', dayId] as const,
};
