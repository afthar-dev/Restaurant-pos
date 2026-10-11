import { Suspense } from 'react';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody, Skeleton } from '@/shared/ui';
import { ChartFrame } from '../charts/ChartFrame';
import { hourPoints } from '../charts/points';
import { billCount, hourRange } from '../charts/scale';
import type { SalesReport } from '../types';
import { LazyColumnChart } from './LazyColumnChart';

/** Owner home: sales by India hour for the report's days, with the busiest hour as the takeaway. */
export function HourlySales({ hours, title }: { hours: SalesReport['hours']; title: string }) {
  if (hours.length === 0) return null;
  const peak = hours.reduce((a, b) => (b.total > a.total ? b : a));
  return (
    <section aria-label={title}>
      <Card className="h-full">
        <CardBody>
          <ChartFrame
            as="h2"
            title={title}
            takeaway={`Busiest: ${hourRange(peak.hour)}, ${rupees(peak.total)} from ${billCount(peak.bills)}`}
          >
            {/* Same 160 px height as the chart, so the card does not jump when it arrives. */}
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <LazyColumnChart title={title} points={hourPoints(hours)} height={160} />
            </Suspense>
          </ChartFrame>
        </CardBody>
      </Card>
    </section>
  );
}
