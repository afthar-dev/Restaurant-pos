import { lazy, Suspense, type ComponentProps, type ComponentType } from 'react';
import { Link } from 'react-router';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody, Skeleton } from '@/shared/ui';
import { ChartFrame } from '../charts/ChartFrame';
import type { ColumnChart as Chart } from '../charts/ColumnChart';
import { billCount, dayLabel, shortDayLabel } from '../charts/scale';
import type { ChartPoint } from '../charts/types';
import { useSalesReport } from '../queries';
import { datesInRange, presetRange } from '../ranges';

// Recharts is big: the home screen loads it after the card's text is on screen. If its code
// cannot load (app updated, Wi-Fi dropped), the card keeps its text and goes without the
// chart, rather than the error taking down the whole home screen.
const ColumnChart = lazy<ComponentType<ComponentProps<typeof Chart>>>(() =>
  import('../charts/ColumnChart').catch(() => ({ default: () => null })),
);

/** Owner home: the last seven India dates, today highlighted; closed days are empty slots. */
export function WeekTrend() {
  // Worked out on each render, so a screen left open overnight moves to the new day.
  const range = presetRange('last7Days');
  const report = useSalesReport(range);
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
  const today = byDate.get(range.to)?.total ?? 0;
  const points: ChartPoint[] = datesInRange(range).map((date) => {
    const t = byDate.get(date) ?? { total: 0, bills: 0 };
    return {
      key: date,
      label: shortDayLabel(date),
      value: t.total,
      detail: `${dayLabel(date)} · ${rupees(t.total)} · ${billCount(t.bills)}`,
      highlight: date === range.to,
    };
  });

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <ChartFrame
          as="h2"
          title="Last 7 days"
          takeaway={`Today ${rupees(today)} · 7-day total ${rupees(week)}`}
        >
          {/* Same 96 px height as the chart, so the card does not jump when it arrives. */}
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <ColumnChart title="Last 7 days" points={points} height={96} compact />
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
