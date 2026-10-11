import { ArrowRight, BellRing, UtensilsCrossed } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { useBusinessDay, useCloseCheck } from '@/features/day';
import { useQrPending } from '@/features/orders';
import { SetupCard } from '@/features/setup';
import { rupees } from '@/shared/lib/money';
import { PRINT_TIME_ZONE } from '@/shared/lib/when';
import { useCan, useSession } from '@/shared/session/store';
import { Button, Card, CardBody, CardHeader, Skeleton, StatStrip } from '@/shared/ui';
import { visibleNav } from '../navigation';
import { DayNotOpen } from './DayNotOpen';
import { LowStockBadges, useLowStock } from './LowStockBadges';
import { OwnerHomeSkeleton } from './owner/OwnerHomeSkeleton';

const OwnerHome = lazy(() => import('./owner/OwnerHome'));

/** Manager: what still blocks closing, and the cash the drawer should hold. */
function OpenWork() {
  const check = useCloseCheck();
  if (check.isError) return null;
  if (!check.data) return <Skeleton className="h-32" />;
  const { blockers, cash } = check.data;
  const open = blockers.orders.length;
  const unpaid = blockers.bills.length;
  return (
    <Card>
      <CardHeader
        title="Before closing the day"
        description={
          open + unpaid === 0
            ? 'Every order is settled. The day can be closed.'
            : 'Tables and bills still open.'
        }
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/day">Day close</Link>
          </Button>
        }
      />
      <StatStrip
        bare
        label="Open work"
        className="border-t border-border"
        items={[
          { label: 'Open orders', value: String(open) },
          { label: 'Unpaid bills', value: String(unpaid), tone: unpaid > 0 ? 'danger' : undefined },
          {
            label: 'Cash expected',
            value: rupees(cash.expected),
            hint: 'Opening + cash sales − cash expenses',
          },
        ]}
      />
    </Card>
  );
}

function QrWaiting() {
  const pending = useQrPending(true);
  // Waiters without the POS approve QR orders from the captain app.
  const canPos = useCan('bill.print');
  const count = pending.data?.length ?? 0;
  if (count === 0) return null;
  return (
    <Card className="border-violet-200 bg-violet-50">
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold text-violet-900">
          <BellRing aria-hidden="true" className="size-5" />
          {`${count} QR ${count === 1 ? 'order' : 'orders'} waiting for approval`}
        </span>
        <Button asChild size="sm">
          <Link to={canPos ? '/pos' : '/captain'}>Review</Link>
        </Button>
      </CardBody>
    </Card>
  );
}

function LowStock() {
  const { low } = useLowStock();
  if (low.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Running low"
        description="At or below the alert level. Order more or count them."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/stock">Stock</Link>
          </Button>
        }
      />
      <CardBody className="flex flex-wrap gap-2">
        <LowStockBadges names={low} />
      </CardBody>
    </Card>
  );
}

/** Large shortcuts to every area this person can open. */
function QuickActions() {
  const permissions = useSession((s) => s.permissions);
  const entries = visibleNav(permissions).filter((n) => n.to !== '/');
  return (
    <section aria-label="Go to" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Go to</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((area) => {
          const Icon = area.icon;
          return (
            <Link
              key={area.to}
              to={area.to}
              className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary-300 hover:bg-primary-50/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-text">{area.title}</span>
                <span className="text-sm text-muted">{area.description}</span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="mt-1 size-4 text-subtle transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The first screen after sign-in: what needs attention today, then shortcuts. Each card shows
 * only for people allowed to see it, so no request is made that the server would refuse.
 */
export function HomePage() {
  const user = useSession((s) => s.user);
  const day = useBusinessDay();
  // Only the owner holds the reports: the owner gets today at a glance, everyone else the
  // work waiting for them.
  const isOwner = useCan('reports.all');
  const canClose = useCan('day.openClose');
  const canQr = useCan('order.approveQr');
  const canStock = useCan('stock.manage');
  const dayOpen = Boolean(day.data?.day);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UtensilsCrossed aria-hidden="true" className="size-6 text-primary-700" />
          {`Welcome, ${user?.name ?? ''}`}
        </h1>
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: PRINT_TIME_ZONE,
          })}
        </p>
      </header>
      <SetupCard />
      {isOwner ? (
        // Loaded on its own, so the dashboard stays out of the first download.
        <Suspense fallback={<OwnerHomeSkeleton />}>
          <OwnerHome />
        </Suspense>
      ) : (
        <>
          {day.data && !dayOpen && <DayNotOpen />}
          {canQr && dayOpen && <QrWaiting />}
          {canClose && dayOpen && <OpenWork />}
          {canStock && <LowStock />}
        </>
      )}
      <QuickActions />
    </section>
  );
}
