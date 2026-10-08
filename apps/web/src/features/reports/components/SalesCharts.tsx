import { useId } from 'react';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody } from '@/shared/ui';
import { BarChart, type Bar } from '../charts/BarChart';
import { PaymentMix } from '../charts/PaymentMix';
import { billCount, dayLabel, hourLabel, hourRange, shortDayLabel } from '../charts/scale';
import { TopDishes } from '../charts/TopDishes';
import type { SalesReport } from '../types';

function dayBars(days: SalesReport['days']): Bar[] {
  const every = Math.ceil(days.length / 8);
  return days.map((d, i) => ({
    key: d.dayId,
    label: i % every === 0 ? shortDayLabel(d.date) : '',
    value: d.total,
    detail: `${dayLabel(d.date)} · ${rupees(d.total)} · ${billCount(d.bills)}`,
  }));
}

/**
 * The hours in service order: the day starts after the longest quiet stretch, so a late night
 * (11pm, 12am, 1am) sits next to the evening instead of at the far left.
 */
function serviceHours(busy: number[]): number[] {
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

/** Every hour from the first to the last with sales, so quiet hours show as gaps. */
function hourBars(hours: SalesReport['hours']): Bar[] {
  const order = serviceHours(hours.map((h) => h.hour));
  const first = order[0]!;
  const bars: Bar[] = [];
  for (const h of order) {
    const row = hours.find((x) => x.hour === h);
    const total = row?.total ?? 0;
    const bills = row?.bills ?? 0;
    bars.push({
      key: String(h),
      label: h % 3 === 0 || h === first ? hourLabel(h) : '',
      value: total,
      detail: `${hourRange(h)} · ${rupees(total)} · ${billCount(bills)}`,
    });
  }
  return bars;
}

const most = <T,>(rows: T[], value: (row: T) => number) =>
  rows.reduce((a, b) => (value(b) > value(a) ? b : a));

/** The report's charts; the tables below stay the full data. */
export function SalesCharts({ report }: { report: SalesReport }) {
  const id = useId();
  const { days, hours, items, summary } = report;
  if (summary.bills === 0) return null;
  const paid = summary.payments.CASH + summary.payments.UPI + summary.payments.CARD;
  const bestDay = days.length >= 2 ? most(days, (d) => d.total) : null;
  const peak = hours.length > 0 ? most(hours, (h) => h.total) : null;

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        At a glance
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {bestDay && (
          <Card>
            <CardBody>
              <BarChart
                title="Sales by day"
                takeaway={`Best day: ${dayLabel(bestDay.date)}, ${rupees(bestDay.total)}`}
                bars={dayBars(days)}
              />
            </CardBody>
          </Card>
        )}
        {peak && (
          <Card>
            <CardBody>
              <BarChart
                title="Busiest hours"
                takeaway={`Busiest: ${hourRange(peak.hour)}, ${rupees(peak.total)} from ${billCount(peak.bills)}`}
                bars={hourBars(hours)}
              />
            </CardBody>
          </Card>
        )}
        {paid > 0 && (
          <Card>
            <CardBody>
              <PaymentMix payments={summary.payments} />
            </CardBody>
          </Card>
        )}
        {items.length > 0 && (
          <Card>
            <CardBody>
              <TopDishes items={items} />
            </CardBody>
          </Card>
        )}
      </div>
    </section>
  );
}
