import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { FloorAreaStatus } from './types';

interface Alert {
  id: string;
  text: string;
}

const SHOW_FOR_MS = 10_000;

/** "T4: food is ready to serve" when the kitchen marks a ticket ready. */
export function ReadyAlerts() {
  const client = useQueryClient();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useRealtimeEvent('kot.updated', (payload) => {
    const event = payload as { kotId: string; orderId: string; status: string };
    if (event.status !== 'READY') return;
    const floor = client.getQueryData<FloorAreaStatus[]>(['floor', 'status']) ?? [];
    const table = floor.flatMap((a) => a.tables).find((t) => t.order?.orderId === event.orderId);
    const text = table ? `${table.name}: food is ready to serve` : 'An order is ready to serve';
    setAlerts((current) => [...current, { id: event.kotId, text }]);
    setTimeout(
      () => setAlerts((current) => current.filter((a) => a.id !== event.kotId)),
      SHOW_FOR_MS,
    );
  });

  if (alerts.length === 0) return null;
  return (
    <div
      className="fixed inset-x-3 bottom-3 z-20 flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {alerts.map((a) => (
        <p
          key={a.id}
          className="rounded-lg bg-emerald-800 px-4 py-3 font-medium text-white shadow-lg"
        >
          {a.text}
        </p>
      ))}
    </div>
  );
}
