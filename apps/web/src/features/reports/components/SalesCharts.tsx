import { useId } from 'react';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody } from '@/shared/ui';
import { AreaTrend } from '../charts/AreaTrend';
import { ChartFrame } from '../charts/ChartFrame';
import { ColumnChart } from '../charts/ColumnChart';
import { PaymentMix } from '../charts/PaymentMix';
import { dayPoints, hourPoints } from '../charts/points';
import { billCount, dayLabel, hourRange } from '../charts/scale';
import { TopDishes } from '../charts/TopDishes';
import type { SalesReport } from '../types';

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
              <ChartFrame
                title="Sales by day"
                takeaway={`Best day: ${dayLabel(bestDay.date)}, ${rupees(bestDay.total)}`}
              >
                <ColumnChart title="Sales by day" points={dayPoints(days, true)} />
              </ChartFrame>
            </CardBody>
          </Card>
        )}
        {peak && (
          <Card>
            <CardBody>
              <ChartFrame
                title="Busiest hours"
                takeaway={`Busiest: ${hourRange(peak.hour)}, ${rupees(peak.total)} from ${billCount(peak.bills)}`}
              >
                <AreaTrend title="Busiest hours" points={hourPoints(hours)} />
              </ChartFrame>
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
