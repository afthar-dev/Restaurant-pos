import type { UseQueryResult } from '@tanstack/react-query';
import { useBusinessDay } from '@/features/day';
import {
  HourlySales,
  presetRange,
  TopDishes,
  useDaySalesReport,
  useSalesReport,
  WeekTrend,
  type SalesReport,
} from '@/features/reports';
import { dayAndTime } from '@/shared/lib/when';
import { Card, CardBody, describeError, ErrorNote } from '@/shared/ui';
import { DayNotOpen } from '../DayNotOpen';
import { OwnerHomeSkeleton } from './OwnerHomeSkeleton';
import { RightNow } from './RightNow';
import { TodaysBusiness } from './TodaysBusiness';
import { WatchList } from './WatchList';

/**
 * The report's hour chart and best dishes, side by side on wide screens. Both are views of the
 * business section's report, so a failed report is shown once, there, and these stay away.
 */
function HoursAndDishes({ report }: { report: SalesReport }) {
  const sold = report.summary.bills > 0;
  const best = [...report.items].sort((a, b) => b.amount - a.amount);
  const showHours = sold && report.hours.length > 0;
  const showDishes = sold && best.length > 0;
  if (!showHours && !showDishes) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {showHours && <HourlySales hours={report.hours} title="Today by hour" />}
      {showDishes && (
        <section aria-label="Top dishes">
          <Card className="h-full">
            <CardBody>
              <TopDishes items={best} limit={5} as="h2" />
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}

function ReportSections({
  report,
  label,
  since,
}: {
  report: UseQueryResult<SalesReport>;
  label: string;
  since?: string;
}) {
  return (
    <>
      <TodaysBusiness report={report} label={label} since={since} />
      {report.data && <HoursAndDishes report={report.data} />}
    </>
  );
}

/** The open business day, by id: it stays one day when service runs past midnight. */
function OpenDaySections({ dayId, openedAt }: { dayId: string; openedAt: string }) {
  const report = useDaySalesReport(dayId, { poll: true });
  return (
    <ReportSections
      report={report}
      label="This business day"
      since={`Since ${dayAndTime(openedAt)}`}
    />
  );
}

/** With no day open, the sales of today's date. */
function TodaySections() {
  // Worked out on each render, so a screen left open overnight moves to the new day.
  const report = useSalesReport(presetRange('today'), { poll: true });
  return <ReportSections report={report} label="Today" />;
}

/**
 * Owner: today at a glance. What is happening now, how the business day is going, what to
 * watch, then the week. Each section asks for its own data, so one failing leaves the rest.
 */
export default function OwnerHome() {
  const day = useBusinessDay();
  if (day.isError) {
    return <ErrorNote message={describeError(day.error)} onRetry={() => void day.refetch()} />;
  }
  if (!day.data) return <OwnerHomeSkeleton />;
  const open = day.data.day;
  return (
    <>
      {open ? <RightNow /> : <DayNotOpen />}
      {open ? <OpenDaySections dayId={open.id} openedAt={open.openedAt} /> : <TodaySections />}
      <WatchList day={open} />
      <WeekTrend openedAt={open?.openedAt} />
    </>
  );
}
