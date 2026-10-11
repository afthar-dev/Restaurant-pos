import { Ban, CheckCircle2, Clock, PackageX, Percent, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useDayReport } from '@/features/day';
import { rupees } from '@/shared/lib/money';
import { dayAndTime } from '@/shared/lib/when';
import { useCan } from '@/shared/session/store';
import { Button, Card, CardBody, describeError, ErrorNote, Skeleton } from '@/shared/ui';
import { STALE_DAY_HOURS } from '../../shell/DayStatusPill';
import { LowStockBadges, useLowStock } from '../LowStockBadges';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sum = <T,>(rows: T[], amount: (row: T) => number) => rows.reduce((n, r) => n + amount(r), 0);

function Row({
  icon: Icon,
  children,
  action,
}: {
  icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <Icon aria-hidden="true" className="size-5 shrink-0 text-amber-800" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-text">
        {children}
      </div>
      {action}
    </li>
  );
}

const linkTo = (to: string, text: string) => (
  <Button asChild variant="secondary" size="sm">
    <Link to={to}>{text}</Link>
  </Button>
);

/**
 * What the owner should look at: voided bills and discounts of the open business day, low
 * stock, and a day left open too long. With no day open only low stock can show, and the card
 * is left out when there is none.
 */
export function WatchList({ day }: { day: { id: string; openedAt: string } | null }) {
  const canReport = useCan('reports.dayClose');
  const canStock = useCan('stock.manage');
  const report = useDayReport(canReport ? day?.id : undefined, { poll: true });
  const stock = useLowStock(canStock);

  const voids = report.data?.voids ?? [];
  const discounts = report.data?.discounts ?? [];
  const stale = day !== null && Date.now() - Date.parse(day.openedAt) > STALE_DAY_HOURS * 3600_000;
  const loading =
    (Boolean(day) && canReport && report.isPending) || (canStock && stock.query.isPending);
  const reportFailed = Boolean(day) && canReport && report.isError;

  const rows = [
    voids.length > 0 && (
      <Row key="voids" icon={Ban} action={linkTo('/day', 'Day report')}>
        {`${plural(voids.length, 'voided bill', 'voided bills')} · ${rupees(sum(voids, (v) => v.total))}`}
      </Row>
    ),
    discounts.length > 0 && (
      <Row key="discounts" icon={Percent}>
        {`${plural(discounts.length, 'discount', 'discounts')} given · ${rupees(sum(discounts, (d) => d.amount))}`}
      </Row>
    ),
    stock.low.length > 0 && (
      <Row key="stock" icon={PackageX} action={linkTo('/stock', 'Stock')}>
        <span className="font-medium">Running low</span>
        <LowStockBadges names={stock.low} />
      </Row>
    ),
    stale && day && (
      <Row key="stale" icon={Clock} action={linkTo('/day', 'Close the day')}>
        {`This business day has been open for over ${STALE_DAY_HOURS} hours (since ${dayAndTime(day.openedAt)}).`}
      </Row>
    ),
  ].filter(Boolean);

  if (!day && rows.length === 0) return null;

  return (
    <section aria-labelledby="home-watch" className="flex flex-col gap-3">
      <h2 id="home-watch" className="text-sm font-semibold tracking-wide text-muted uppercase">
        Watch list
      </h2>
      {reportFailed && (
        <ErrorNote message={describeError(report.error)} onRetry={() => void report.refetch()} />
      )}
      {rows.length > 0 ? (
        <Card>
          <ul className="divide-y divide-border">{rows}</ul>
        </Card>
      ) : loading ? (
        <Skeleton className="h-14" />
      ) : (
        !reportFailed && (
          <Card>
            <CardBody className="flex flex-wrap items-center gap-2 text-sm text-text">
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-green-800" />
              <span className="font-medium">All clear</span>
              <span className="text-muted">No voids, discounts or low stock.</span>
            </CardBody>
          </Card>
        )
      )}
    </section>
  );
}
