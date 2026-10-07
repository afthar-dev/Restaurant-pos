import { useNotify } from '@/features/notifications';
import { useCan } from '@/shared/session/store';
import { useRealtimeEvent } from '@/shared/realtime/RealtimeProvider';
import { useQrPending } from '../../queries';

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes === 0 ? 'just now' : `${minutes} min ago`;
};

/**
 * QR requests waiting for staff on POS and captain (spec §5.3 "receive an alert"): a list to
 * open each table's order, and a short alert when a new one arrives.
 */
export function QrInbox({ onOpen }: { onOpen: (orderId: string) => void }) {
  const canApprove = useCan('order.approveQr');
  const pending = useQrPending(canApprove);
  const notify = useNotify();

  useRealtimeEvent('qr.submitted', (payload) => {
    if (!canApprove) return;
    const { tableName } = payload as { tableName?: string };
    notify({
      id: 'qr-submitted',
      text: `New QR order at ${tableName ?? 'a table'}`,
      tone: 'warning',
    });
  });

  const requests = pending.data ?? [];
  if (!canApprove || requests.length === 0) return null;
  return (
    <section
      aria-label="QR orders waiting"
      className="flex flex-col gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3"
    >
      <h2 className="text-sm font-semibold text-amber-950">QR orders waiting</h2>
      {requests.map((r) => {
        const dishes = r.lines.reduce((n, l) => n + l.quantity, 0);
        return (
          <button
            key={r.id}
            type="button"
            className="flex min-h-11 items-center justify-between rounded-md bg-white px-3 text-left text-sm"
            onClick={() => onOpen(r.orderId)}
          >
            {`${r.tableName ?? 'Table'} · ${dishes} ${dishes === 1 ? 'dish' : 'dishes'} · ${ago(r.createdAt)}`}
          </button>
        );
      })}
    </section>
  );
}
