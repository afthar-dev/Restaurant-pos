import { MousePointerClick } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { EmptyState } from '@/shared/ui';
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
          <div className="flex flex-col gap-5">
            <QrInbox onOpen={select} />
            <ParcelList selectedOrderId={orderId} onSelect={select} />
            <FloorGrid selectedOrderId={orderId} onSelect={select} />
          </div>
          <div className="min-w-0">
            {orderId ? (
              <OrderWorkspace
                key={orderId}
                orderId={orderId}
                layout="columns"
                onClosed={() => select(null)}
              />
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
