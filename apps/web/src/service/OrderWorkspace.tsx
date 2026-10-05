import { MenuBrowser } from './MenuBrowser';
import { OrderPanel } from './OrderPanel';
import { useOrder } from './queries';

/** The selected order with the menu to add dishes. `layout` decides side-by-side or stacked. */
export function OrderWorkspace({
  orderId,
  layout,
  onClosed,
}: {
  orderId: string;
  layout: 'columns' | 'stack';
  onClosed: () => void;
}) {
  const order = useOrder(orderId);
  const editable = order.data?.status === 'OPEN';
  return (
    <div
      className={
        layout === 'columns'
          ? 'grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]'
          : 'flex flex-col gap-4'
      }
    >
      <OrderPanel orderId={orderId} onClosed={onClosed} />
      {order.data && editable && <MenuBrowser orderId={orderId} orderType={order.data.type} />}
    </div>
  );
}
