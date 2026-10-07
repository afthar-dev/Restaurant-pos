import { useSearchParams } from 'react-router';
import { secondaryButton } from '@/shared/ui';
import { DayGate } from '@/features/day/components/DayGate';
import { FloorGrid } from '@/features/orders/components/FloorGrid';
import { OrderWorkspace } from '../components/OrderWorkspace';
import { QrInbox } from '@/features/orders/components/qr/QrInbox';
import { useReadyAlerts } from '@/features/orders/useReadyAlerts';

/** Waiter phone screen: tables first, then one order at a time. */
export function CaptainPage() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order');
  const select = (id: string | null) => setParams(id ? { order: id } : {});
  useReadyAlerts();

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-3">
      <h1 className="sr-only">Captain app</h1>
      <DayGate>
        <QrInbox onOpen={select} />
        {orderId ? (
          <>
            <button
              type="button"
              className={`${secondaryButton} min-h-11 self-start`}
              onClick={() => select(null)}
            >
              Back to tables
            </button>
            <OrderWorkspace
              key={orderId}
              orderId={orderId}
              layout="stack"
              onClosed={() => select(null)}
            />
          </>
        ) : (
          <FloorGrid selectedOrderId={null} onSelect={select} />
        )}
      </DayGate>
    </section>
  );
}
