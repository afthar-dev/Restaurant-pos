import { Banknote, BellRing, ChefHat, Grid2x2, Receipt } from 'lucide-react';
import { useCloseCheck } from '@/features/day';
import { useActiveOrders, useFloorStatus, useQrPending } from '@/features/orders';
import { rupees } from '@/shared/lib/money';
import { useCan } from '@/shared/session/store';
import { Skeleton } from '@/shared/ui';
import { Tile, TileError, Unit } from './Tile';

function TablesTile() {
  const floor = useFloorStatus();
  if (floor.isError) {
    return <TileError label="Tables busy" icon={Grid2x2} onRetry={() => void floor.refetch()} />;
  }
  if (!floor.data) return <Skeleton className="h-24" />;
  const tables = floor.data.flatMap((area) => area.tables);
  const busy = tables.filter((t) => t.order !== null).length;
  return (
    <Tile
      to="/pos"
      icon={Grid2x2}
      label="Tables busy"
      name={`Tables busy: ${busy} of ${tables.length}`}
      detail={busy === tables.length && tables.length > 0 ? 'Every table is taken' : undefined}
    >
      {busy}
      <Unit>{`of ${tables.length}`}</Unit>
    </Tile>
  );
}

function KitchenTile() {
  const orders = useActiveOrders();
  if (orders.isError) {
    return (
      <TileError label="In the kitchen" icon={ChefHat} onRetry={() => void orders.refetch()} />
    );
  }
  if (!orders.data) return <Skeleton className="h-24" />;
  const cooking = orders.data.reduce((n, o) => n + (o.kitchen?.cooking ?? 0), 0);
  const ready = orders.data.reduce((n, o) => n + (o.kitchen?.ready ?? 0), 0);
  return (
    <Tile
      to="/kds"
      icon={ChefHat}
      label="In the kitchen"
      name={`In the kitchen: ${cooking} cooking, ${ready} ready`}
      attention={ready > 0}
      detail={ready > 0 ? 'Ready to serve' : undefined}
    >
      {cooking}
      <Unit>cooking</Unit>
      {ready}
      <Unit>ready</Unit>
    </Tile>
  );
}

function QrTile() {
  const pending = useQrPending(true);
  // Waiters without the POS approve QR orders from the captain app; the owner has both.
  const canPos = useCan('bill.print');
  if (pending.isError) {
    return (
      <TileError label="QR orders waiting" icon={BellRing} onRetry={() => void pending.refetch()} />
    );
  }
  if (!pending.data) return <Skeleton className="h-24" />;
  const count = pending.data.length;
  return (
    <Tile
      to={canPos ? '/pos' : '/captain'}
      icon={BellRing}
      label="QR orders waiting"
      name={`QR orders waiting: ${count}`}
      attention={count > 0}
      detail={count > 0 ? 'Needs approval' : undefined}
    >
      {count}
    </Tile>
  );
}

function CloseCheckTiles() {
  const check = useCloseCheck();
  if (check.isError) {
    return (
      <>
        <TileError label="Unpaid bills" icon={Receipt} onRetry={() => void check.refetch()} />
        <TileError label="Cash expected" icon={Banknote} onRetry={() => void check.refetch()} />
      </>
    );
  }
  if (!check.data) {
    return (
      <>
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </>
    );
  }
  const bills = check.data.blockers.bills;
  const due = bills.reduce((n, b) => n + b.due, 0);
  return (
    <>
      <Tile
        to="/day"
        icon={Receipt}
        label="Unpaid bills"
        name={`Unpaid bills: ${bills.length}, ${rupees(due)}`}
        attention={bills.length > 0}
        detail={bills.length > 0 ? 'Still to collect' : 'All settled'}
      >
        {bills.length}
        <Unit>{rupees(due)}</Unit>
      </Tile>
      <Tile
        to="/day"
        icon={Banknote}
        label="Cash expected"
        name={`Cash expected: ${rupees(check.data.cash.expected)}`}
        detail="In the drawer"
      >
        {rupees(check.data.cash.expected)}
      </Tile>
    </>
  );
}

/**
 * What is happening in the restaurant this minute, one tile per area. A tile needs data its
 * owner may not see (a custom role), so it shows only for people who can.
 */
export function RightNow() {
  const canFloor = useCan('order.take');
  const canQr = useCan('order.approveQr');
  const canClose = useCan('day.openClose');
  if (!canFloor && !canQr && !canClose) return null;
  return (
    <section aria-labelledby="home-right-now" className="flex flex-col gap-3">
      <h2 id="home-right-now" className="text-sm font-semibold tracking-wide text-muted uppercase">
        Right now
      </h2>
      {/* On phones an odd last tile stretches across, so no tile sits alone beside a gap. */}
      <div className="grid grid-cols-2 gap-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3 lg:grid-cols-5">
        {canFloor && <TablesTile />}
        {canFloor && <KitchenTile />}
        {canQr && <QrTile />}
        {canClose && <CloseCheckTiles />}
      </div>
    </section>
  );
}
