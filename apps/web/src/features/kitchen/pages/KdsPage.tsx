import type { KotStatus } from '@rpos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/shared/api/http';
import { useCurrentDevice } from '@/features/auth/hooks';
import { LoadingScreen } from '@/features/auth/components/RequireAuth';
import { describeError, ErrorNote } from '@/shared/ui';
import { POLL_MS } from '@/shared/api/queryClient';
import { orderLabel, type KdsTicket } from '@/features/orders/types';

const STATION_KEY = 'rpos.kds.station';

function remembered(): string {
  try {
    return localStorage.getItem(STATION_KEY) ?? '';
  } catch {
    return '';
  }
}

function remember(value: string) {
  try {
    localStorage.setItem(STATION_KEY, value);
  } catch {
    // Private mode or blocked storage: the filter just resets on reload.
  }
}

function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const NEXT: Record<string, { status: KotStatus; verb: string }> = {
  NEW: { status: 'PREPARING', verb: 'Start' },
  PREPARING: { status: 'READY', verb: 'Ready' },
  READY: { status: 'SERVED', verb: 'Picked up' },
};

function TicketCard({
  ticket,
  now,
  onAdvance,
  busy,
}: {
  ticket: KdsTicket;
  now: number;
  onAdvance: (status: KotStatus) => void;
  busy: boolean;
}) {
  const cancelled = ticket.type === 'CANCEL';
  const label = `KOT ${ticket.kotNo}, ${orderLabel(ticket)}${cancelled ? ', cancelled' : ''}`;
  const minutes = Math.max(0, Math.floor((now - new Date(ticket.createdAt).getTime()) / 60_000));
  const next = cancelled ? { status: 'SERVED' as KotStatus, verb: 'Dismiss' } : NEXT[ticket.status];
  const late = !cancelled && ticket.status !== 'READY' && minutes >= 20;

  return (
    <article
      aria-label={label}
      className={`flex flex-col gap-3 rounded-xl border-2 bg-white p-4 ${
        cancelled ? 'border-red-600 bg-red-50' : late ? 'border-amber-500' : 'border-slate-200'
      }`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold">
          {cancelled && <span className="mr-2 text-red-700">CANCEL</span>}
          KOT {ticket.kotNo}
        </span>
        <span className="text-xl font-semibold">{orderLabel(ticket)}</span>
      </header>
      <p className="text-sm text-slate-600">
        {ticket.stationName} · {ticket.waiterName} · {minutes} min
      </p>
      <ul className="flex flex-col gap-2 text-lg">
        {ticket.lines.map((l) => (
          <li key={l.id} className={cancelled ? 'text-red-800 line-through' : ''}>
            <span className="font-semibold">
              {l.quantity} × {l.itemName}
              {l.variantName !== 'Regular' ? ` (${l.variantName})` : ''}
            </span>
            {l.addons.map((a) => (
              <span key={a} className="block pl-6 text-base text-slate-700">
                {a}
              </span>
            ))}
            {l.comboComponents.map((c) => (
              <span
                key={`${c.itemName}-${c.variantName}`}
                className="block pl-6 text-base text-slate-700"
              >
                {c.quantity * l.quantity} × {c.itemName}
                {c.variantName !== 'Regular' ? ` (${c.variantName})` : ''}
              </span>
            ))}
            {l.note && (
              <span className="block pl-6 text-base italic text-amber-800">“{l.note}”</span>
            )}
          </li>
        ))}
      </ul>
      {next && (
        <button
          type="button"
          aria-label={`${next.verb} KOT ${ticket.kotNo}`}
          disabled={busy}
          onClick={() => onAdvance(next.status)}
          className={`min-h-14 rounded-lg text-lg font-semibold text-white disabled:opacity-60 ${
            cancelled ? 'bg-red-700' : 'bg-emerald-700'
          }`}
        >
          {next.verb}
        </button>
      )}
    </article>
  );
}

function KitchenBoard() {
  const queryClient = useQueryClient();
  const now = useMinuteTick();
  const [station, setStation] = useState(remembered);
  const stationList = useQuery({
    queryKey: ['kds', 'stations'],
    queryFn: () =>
      apiFetch<{ id: string; name: string }[]>('/api/kds/stations', { skipRefresh: true }),
    staleTime: 5 * 60_000,
  });
  // A remembered station that was archived would hide every ticket: forget it.
  const knownStation =
    !station || !stationList.data || stationList.data.some((s) => s.id === station);
  useEffect(() => {
    if (!knownStation) {
      setStation('');
      remember('');
    }
  }, [knownStation]);
  const tickets = useQuery({
    queryKey: ['kds'],
    queryFn: () => apiFetch<KdsTicket[]>('/api/kds/kots', { skipRefresh: true }),
    refetchInterval: POLL_MS,
  });
  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: KotStatus }) =>
      apiFetch(`/api/kds/kots/${id}`, { method: 'PATCH', body: { status }, skipRefresh: true }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['kds'] }),
  });

  // A failed background refetch keeps the last tickets on screen; the header shows offline.
  if (!tickets.data) {
    return tickets.isError ? (
      <ErrorNote message={describeError(tickets.error)} />
    ) : (
      <LoadingScreen />
    );
  }

  const stations = stationList.data ?? [];
  const shown = tickets.data.filter((t) => !station || !knownStation || t.stationId === station);
  const columns: { name: string; match: (t: KdsTicket) => boolean }[] = [
    { name: 'New', match: (t) => t.status === 'NEW' },
    { name: 'Preparing', match: (t) => t.status === 'PREPARING' },
    { name: 'Ready', match: (t) => t.status === 'READY' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kitchen</h1>
        <label className="flex items-center gap-2 text-lg" htmlFor="kds-station">
          Station
          <select
            id="kds-station"
            className="min-h-11 rounded-md border border-slate-300 bg-white px-3"
            value={station}
            onChange={(e) => {
              setStation(e.target.value);
              remember(e.target.value);
            }}
          >
            <option value="">All stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {station && !stations.some((s) => s.id === station) && (
              // Keeps the select honest while the station list loads.
              <option value={station}>Saved station</option>
            )}
          </select>
        </label>
      </div>
      <ErrorNote message={advance.isError ? describeError(advance.error) : null} />
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((column) => {
          const list = shown.filter(column.match);
          return (
            <section key={column.name} aria-label={column.name} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-500">
                {column.name} <span className="tabular-nums">({list.length})</span>
              </h2>
              {list.map((t) => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  now={now}
                  busy={advance.isPending && advance.variables?.id === t.id}
                  onAdvance={(status) => advance.mutate({ id: t.id, status })}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Kitchen screen. Signs in as a device (no staff PIN), so it keeps running all shift. */
export function KdsPage() {
  const device = useCurrentDevice();
  if (device.data === undefined) {
    if (device.isError) return <p className="text-slate-700">Cannot reach the server. Retrying…</p>;
    return <LoadingScreen />;
  }
  if (!device.data) {
    return (
      <p className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-slate-700">
        This screen is not set up yet. A manager can register it as a kitchen screen in Admin →
        Devices.
      </p>
    );
  }
  if (device.data.type !== 'KDS') {
    return (
      <p className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-slate-700">
        {device.data.name} is registered as a counter, not a kitchen screen.
      </p>
    );
  }
  return <KitchenBoard />;
}
