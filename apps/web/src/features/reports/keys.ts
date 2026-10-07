import type { DateRange } from './ranges';

export const reportKeys = {
  sales: (range: DateRange) => ['reports', 'sales', range.from, range.to] as const,
};
