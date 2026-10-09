import { ArrowLeft, MousePointerClick } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { EmptyState, secondaryButton } from '@/shared/ui';
import { DayGate } from '@/features/day';
import { FloorGrid, ParcelList, QrInbox } from '@/features/orders';
import { OrderWorkspace } from '../components/OrderWorkspace';
import { ReadyAlerts } from '../components/ReadyAlerts';

/** Counter screen: floor and parcels on the left, the selected order and menu on the right. */
export function PosPage() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order');
  const select = (id: string | null) => setParams(id ? { order: id } : {}, { replace: true });

  return (
    <section className="flex flex-col gap-3">
      <h1 className="sr-only">POS counter</h1>
      <DayGate>
        <ReadyAlerts />
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)]">
          {/* Below desktop width an open order takes the whole screen, as on the captain app. */}
          <div data-pos-floor className={cn('flex flex-col gap-5', orderId && 'max-lg:hidden')}>
            <QrInbox onOpen={select} />
            <ParcelList selectedOrderId={orderId} onSelect={select} />
            <FloorGrid selectedOrderId={orderId} onSelect={select} />
          </div>
          <div className="min-w-0">
            {orderId ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className={`${secondaryButton} min-h-11 self-start lg:hidden`}
                  onClick={() => select(null)}
                >
                  <ArrowLeft aria-hidden="true" />
                  Back to tables
                </button>
                <OrderWorkspace
                  key={orderId}
                  orderId={orderId}
                  layout="columns"
                  onClosed={() => select(null)}
                />
              </div>
            ) : (
              <EmptyState
                icon={<MousePointerClick />}
                title="Pick a table or start a parcel"
                description="Tap a free table to seat guests, or a running one to add dishes, bill or take payment."
              />
            )}
          </div>
        </div>
      </DayGate>
    </section>
  );
}
