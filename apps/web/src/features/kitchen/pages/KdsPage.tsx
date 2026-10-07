import type { KotStatus } from '@rpos/shared';
import { useEffect, useState } from 'react';
import { useCurrentDevice } from '@/features/auth';
import { orderLabel } from '@/features/orders';
import { describeError, ErrorNote, LoadingScreen } from '@/shared/ui';
import { useAdvanceKot } from '../mutations';
import { useKdsStations, useKdsTickets } from '../queries';
import { useStationFilter } from '../store';
import type { KdsTicket } from '../types';

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
      className={`flex flex-col gap-3 rounded-xl border-2 bg-surface p-4 shadow-card ${
        cancelled ? 'border-red-500 bg-red-950/50' : late ? 'border-amber-400' : 'border-border'
      }`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold">
          {cancelled && <span className="mr-2 text-red-400">CANCEL</span>}
          KOT {ticket.kotNo}
        </span>
        <span className="text-xl font-semibold">{orderLabel(ticket)}</span>
      </header>
      <p className="text-sm text-muted">
        {ticket.stationName} · {ticket.waiterName} · {minutes} min
      </p>
      <ul className="flex flex-col gap-2 text-lg">
        {ticket.lines.map((l) => (
          <li key={l.id} className={cancelled ? 'text-red-300 line-through' : ''}>
            <span className="font-semibold">
              {l.quantity} × {l.itemName}
              {l.variantName !== 'Regular' ? ` (${l.variantName})` : ''}
            </span>
            {l.addons.map((a) => (
              <span key={a} className="block pl-6 text-base text-muted">
                {a}
              </span>
            ))}
            {l.comboComponents.map((c) => (
              <span
                key={`${c.itemName}-${c.variantName}`}
                className="block pl-6 text-base text-muted"
              >
                {c.quantity * l.quantity} × {c.itemName}
                {c.variantName !== 'Regular' ? ` (${c.variantName})` : ''}
              </span>
            ))}
            {l.note && (
              <span className="block pl-6 text-base italic text-amber-300">“{l.note}”</span>
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
            cancelled ? 'bg-red-700' : 'bg-primary-700'
          }`}
        >
          {next.verb}
        </button>
      )}
    </article>
  );
}

function KitchenBoard() {
  const now = useMinuteTick();
  const station = useStationFilter((s) => s.station);
  const setStation = useStationFilter((s) => s.setStation);
  useEffect(() => {
    void useStationFilter.persist.rehydrate();
  }, []);
  const stationList = useKdsStations();
  // A remembered station that was archived would hide every ticket: forget it.
  const knownStation =
    !station || !stationList.data || stationList.data.some((s) => s.id === station);
  useEffect(() => {
    if (!knownStation) {
      setStation('');
    }
  }, [knownStation, setStation]);
  const tickets = useKdsTickets();
  const advance = useAdvanceKot();

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
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-text"
            value={station}
            onChange={(e) => {
              setStation(e.target.value);
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
              <h2 className="text-lg font-semibold uppercase tracking-wide text-muted">
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
    if (device.isError) return <p className="text-muted">Cannot reach the server. Retrying…</p>;
    return <LoadingScreen />;
  }
  if (!device.data) {
    return (
      <p className="mx-auto max-w-md rounded-lg border border-border bg-surface p-6 text-muted">
        This screen is not set up yet. A manager can register it as a kitchen screen in Admin →
        Devices.
      </p>
    );
  }
  if (device.data.type !== 'KDS') {
    return (
      <p className="mx-auto max-w-md rounded-lg border border-border bg-surface p-6 text-muted">
        {device.data.name} is registered as a counter, not a kitchen screen.
      </p>
    );
  }
  return <KitchenBoard />;
}
