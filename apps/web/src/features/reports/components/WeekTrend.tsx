import { Link } from 'react-router';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody, Skeleton } from '@/shared/ui';
import { BarChart } from '../charts/BarChart';
import { billCount, dayLabel, shortDayLabel } from '../charts/scale';
import { useSalesReport } from '../queries';
import { datesInRange, presetRange } from '../ranges';

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

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <BarChart
          as="h2"
          title="Last 7 days"
          takeaway={`Today ${rupees(today)} · 7-day total ${rupees(week)}`}
          height={96}
          compact
          bars={datesInRange(range).map((date) => {
            const t = byDate.get(date) ?? { total: 0, bills: 0 };
            return {
              key: date,
              label: shortDayLabel(date),
              value: t.total,
              detail: `${dayLabel(date)} · ${rupees(t.total)} · ${billCount(t.bills)}`,
              highlight: date === range.to,
            };
          })}
        />
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
