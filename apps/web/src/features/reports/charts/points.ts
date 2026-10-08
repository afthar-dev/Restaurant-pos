import { rupees } from '@/shared/lib/money';
import type { SalesReport } from '../types';
import { billCount, dayLabel, hourLabel, hourRange, shortDayLabel } from './scale';
import type { ChartPoint } from './types';

/** One point per business day; about eight axis labels whatever the range. */
export function dayPoints(days: SalesReport['days'], highlightBest = false): ChartPoint[] {
  const every = Math.ceil(days.length / 8);
  const best = highlightBest
    ? days.reduce((a, b) => (b.total > a.total ? b : a), days[0]!)
    : undefined;
  return days.map((d, i) => ({
    key: d.dayId,
    label: i % every === 0 ? shortDayLabel(d.date) : '',
    value: d.total,
    detail: `${dayLabel(d.date)} · ${rupees(d.total)} · ${billCount(d.bills)}`,
    highlight: d === best,
  }));
}

/**
 * The hours in service order: the day starts after the longest quiet stretch, so a late night
 * (11pm, 12am, 1am) sits next to the evening instead of at the far left.
 */
export function serviceHours(busy: number[]): number[] {
  const sorted = [...new Set(busy)].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted;
  let start = sorted[0]!;
  let gap = -1;
  sorted.forEach((hour, i) => {
    const next = sorted[(i + 1) % sorted.length]!;
    const quiet = (next - hour + 24) % 24;
    if (quiet > gap) {
      gap = quiet;
      start = next;
    }
  });
  return Array.from({ length: 24 - gap + 1 }, (_, k) => (start + k) % 24);
}

/** Every hour from the first to the last with sales, so quiet hours show as zero. */
export function hourPoints(hours: SalesReport['hours']): ChartPoint[] {
  const order = serviceHours(hours.map((h) => h.hour));
  const first = order[0];
  return order.map((h) => {
    const row = hours.find((x) => x.hour === h);
    const total = row?.total ?? 0;
    return {
      key: String(h),
      label: h % 3 === 0 || h === first ? hourLabel(h) : '',
      value: total,
      detail: `${hourRange(h)} · ${rupees(total)} · ${billCount(row?.bills ?? 0)}`,
    };
  });
}
