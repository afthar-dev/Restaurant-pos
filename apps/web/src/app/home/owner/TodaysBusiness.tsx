import type { UseQueryResult } from '@tanstack/react-query';
import { percentShares, type SalesReport } from '@/features/reports';
import { cn } from '@/shared/lib/cn';
import { rupees } from '@/shared/lib/money';
import {
  Card,
  CardBody,
  describeError,
  ErrorNote,
  PaymentIcon,
  Skeleton,
  StatStrip,
} from '@/shared/ui';

const orderCount = (n: number) => (n === 1 ? '1 order' : `${n} orders`);

const MODES = [
  { key: 'CASH', label: 'Cash', swatch: 'bg-pay-cash' },
  { key: 'UPI', label: 'UPI', swatch: 'bg-pay-upi' },
  { key: 'CARD', label: 'Card', swatch: 'bg-pay-card' },
] as const;

const TYPES = [
  { key: 'DINE_IN', label: 'Dine-in', swatch: 'bg-primary-600' },
  { key: 'PARCEL', label: 'Parcel', swatch: 'bg-primary-300' },
] as const;

/** A thin bar made of coloured shares; the numbers beside it say the same in words. */
function ShareBar({ parts }: { parts: { key: string; value: number; className: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (total <= 0) return null;
  return (
    <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-2">
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <span
            key={p.key}
            className={cn('h-full', p.className)}
            style={{ width: `${(p.value / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

function Split({ summary }: { summary: SalesReport['summary'] }) {
  const paid = summary.payments.CASH + summary.payments.UPI + summary.payments.CARD;
  const percents = percentShares(MODES.map((m) => summary.payments[m.key]));
  return (
    <Card>
      <CardBody className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text">Dine-in or parcel</h3>
          <ShareBar
            parts={TYPES.map((t) => ({
              key: t.key,
              value: summary.byType[t.key].total,
              className: t.swatch,
            }))}
          />
          <ul aria-label="Dine-in and parcel" className="flex flex-col gap-2 text-sm">
            {TYPES.map((t) => (
              <li key={t.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-sm', t.swatch)} />
                <span className="flex-1 text-text">{t.label}</span>
                <span className="font-medium tabular-nums">
                  {`${rupees(summary.byType[t.key].total)} · ${orderCount(summary.byType[t.key].orders)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {paid > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-text">How customers paid</h3>
            <ShareBar
              parts={MODES.map((m) => ({
                key: m.key,
                value: summary.payments[m.key],
                className: m.swatch,
              }))}
            />
            <ul aria-label="Payment modes" className="flex flex-col gap-2 text-sm">
              {MODES.map((m, i) => (
                <li key={m.key} className="flex items-center gap-2">
                  <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-sm', m.swatch)} />
                  <PaymentIcon mode={m.key} className="text-muted" />
                  <span className="flex-1 text-text">{m.label}</span>
                  <span className="font-medium tabular-nums">
                    {rupees(summary.payments[m.key])}
                  </span>
                  <span className="w-10 text-right text-muted tabular-nums">{`${percents[i]}%`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Revenue, orders and how the day split, for the open business day (or today's date). */
export function TodaysBusiness({
  report,
  label,
  since,
}: {
  report: UseQueryResult<SalesReport>;
  label: string;
  since?: string;
}) {
  const s = report.data?.summary;
  return (
    <section aria-labelledby="home-business" className="flex flex-col gap-3">
      <h2 id="home-business" className="text-sm font-semibold tracking-wide text-muted uppercase">
        Today’s business
      </h2>
      {report.isError ? (
        <ErrorNote message={describeError(report.error)} onRetry={() => void report.refetch()} />
      ) : !s ? (
        <>
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </>
      ) : (
        <>
          <StatStrip
            label={label}
            items={[
              { label: 'Revenue', value: rupees(s.total), hint: since },
              {
                label: 'Orders',
                value: String(s.byType.DINE_IN.orders + s.byType.PARCEL.orders),
              },
              { label: 'Collected', value: rupees(s.collected) },
              { label: 'Average order', value: rupees(s.averageOrder) },
              ...(s.unpaid > 0
                ? [{ label: 'Unpaid', value: rupees(s.unpaid), tone: 'danger' as const }]
                : []),
            ]}
          />
          {s.total > 0 && <Split summary={s} />}
        </>
      )}
    </section>
  );
}
