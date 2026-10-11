import { Suspense } from 'react';
import { Link } from 'react-router';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody, Skeleton } from '@/shared/ui';
import { ChartFrame } from '../charts/ChartFrame';
import { billCount, dayLabel, shortDayLabel } from '../charts/scale';
import type { ChartPoint } from '../charts/types';
import { useSalesReport } from '../queries';
import { LazyColumnChart } from './LazyColumnChart';
import { datesInRange, istDateOf, presetRange } from '../ranges';

/**
 * Owner home: the last seven India dates; closed days are empty slots. The highlighted bar is
 * the open business day (filed under the date it was opened, which is yesterday's after
 * midnight), or today when no day is open.
 */
export function WeekTrend({ openedAt }: { openedAt?: string | null }) {
  // Worked out on each render, so a screen left open overnight moves to the new day.
  const range = presetRange('last7Days');
  const report = useSalesReport(range, { poll: true });
  if (report.isError) return null;
  if (!report.data) return <Skeleton className="h-44" />;

  const byDate = new Map<string, { total: number; bills: number }>();
  for (const d of report.data.days) {
    const t = byDate.get(d.date) ?? { total: 0, bills: 0 };
    byDate.set(d.date, { total: t.total + d.total, bills: t.bills + d.bills });
  }
  const week = [...byDate.entries()]
    .filter(([date]) => date >= range.from && date <= range.to)
    .reduce((n, [, t]) => n + t.total, 0);
  const openDate = openedAt ? istDateOf(openedAt) : null;
  const inWeek = openDate !== null && openDate >= range.from && openDate <= range.to;
  const current = inWeek ? openDate : range.to;
  const nowLabel = inWeek ? 'This business day' : 'Today';
  const now = byDate.get(current)?.total ?? 0;
  const points: ChartPoint[] = datesInRange(range).map((date) => {
    const t = byDate.get(date) ?? { total: 0, bills: 0 };
    return {
      key: date,
      label: shortDayLabel(date),
      value: t.total,
      detail: `${dayLabel(date)} · ${rupees(t.total)} · ${billCount(t.bills)}`,
      highlight: date === current,
    };
  });

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <ChartFrame
          as="h2"
          title="Last 7 days"
          takeaway={`${nowLabel} ${rupees(now)} · 7-day total ${rupees(week)}`}
        >
          {/* Same 96 px height as the chart, so the card does not jump when it arrives. */}
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <LazyColumnChart title="Last 7 days" points={points} height={96} compact />
          </Suspense>
        </ChartFrame>
        <Link
          to="/reports"
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary-800 underline-offset-4 hover:underline"
        >
          See reports
        </Link>
      </CardBody>
    </Card>
  );
}
