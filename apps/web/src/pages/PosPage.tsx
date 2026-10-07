import { useSearchParams } from 'react-router';
import { DayGate } from '@/service/DayGate';
import { FloorGrid } from '@/service/FloorGrid';
import { OrderWorkspace } from '@/service/OrderWorkspace';
import { ParcelList } from '@/service/ParcelList';
import { QrInbox } from '@/service/qr/QrInbox';
import { useReadyAlerts } from '@/service/useReadyAlerts';

/** Counter screen: floor and parcels on the left, the selected order and menu on the right. */
export function PosPage() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order');
  const select = (id: string | null) => setParams(id ? { order: id } : {}, { replace: true });
  useReadyAlerts();

  return (
    <section className="flex flex-col gap-3">
      <h1 className="sr-only">POS counter</h1>
      <DayGate>
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
              <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
                Pick a table or start a parcel order.
              </p>
            )}
          </div>
        </div>
      </DayGate>
    </section>
  );
}
