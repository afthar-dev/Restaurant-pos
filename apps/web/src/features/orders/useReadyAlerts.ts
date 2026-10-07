import { useQueryClient } from '@tanstack/react-query';
import { useNotify } from '@/features/notifications';
import { useRealtimeEvent } from '@/shared/realtime/RealtimeProvider';
import type { FloorAreaStatus } from './types';

interface KotReadyEvent {
  kotId: string;
  orderId: string;
  status: string;
  tableName?: string | null;
  tokenNo?: number | null;
}

/** "T4: food is ready to serve" (or "Parcel #12: ready for pickup") when a ticket is ready. */
export function useReadyAlerts(): void {
  const client = useQueryClient();
  const notify = useNotify();

  useRealtimeEvent('kot.updated', (payload) => {
    const event = payload as KotReadyEvent;
    if (event.status !== 'READY') return;
    // The notice names the order; the cached floor is a fallback for older servers.
    const floor = client.getQueryData<FloorAreaStatus[]>(['floor', 'status']) ?? [];
    const tableName =
      event.tableName ??
      floor.flatMap((a) => a.tables).find((t) => t.order?.orderId === event.orderId)?.name;
    const text = tableName
      ? `${tableName}: food is ready to serve`
      : event.tokenNo
        ? `Parcel #${event.tokenNo}: ready for pickup`
        : 'An order is ready to serve';
    notify({ id: `ready-${event.kotId}`, text, tone: 'success' });
  });
}
