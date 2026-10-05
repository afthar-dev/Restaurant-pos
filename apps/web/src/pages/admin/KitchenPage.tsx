import { printerSchema, stationSchema, type PrinterMode, type PrinterPurpose } from '@rpos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../../auth/api';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  fieldErrors,
  inputClass,
  primaryButton,
  secondaryButton,
  type FieldErrors,
} from '../../components/ui';

export interface Station {
  id: string;
  name: string;
  archivedAt: string | null;
}

interface Printer {
  id: string;
  name: string;
  purpose: PrinterPurpose;
  station: { id: string; name: string } | null;
  mode: PrinterMode;
  paperWidthMm: number;
  address: string | null;
}

export const stationsKey = ['stations'];
const printersKey = ['printers'];

function StationsSection() {
  const queryClient = useQueryClient();
  const stations = useQuery({
    queryKey: stationsKey,
    queryFn: () => apiFetch<Station[]>('/api/stations'),
  });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<Station | null>(null);

  const add = useMutation({
    mutationFn: (body: { name: string }) => apiFetch('/api/stations', { method: 'POST', body }),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: stationsKey });
    },
  });
  const archive = useMutation({
    mutationFn: (s: Station) => apiFetch(`/api/stations/${s.id}/archive`, { method: 'POST' }),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: stationsKey });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = stationSchema.safeParse({ name: name.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    add.mutate(parsed.data);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">Kitchen stations</h3>
        <p className="text-sm text-slate-600">
          Each menu category sends its KOTs to one station, such as Main kitchen, Tandoor or Bar.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-3">
        <Field id="station-name" label="Station name" error={error}>
          <input
            id="station-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <button type="submit" className={primaryButton} disabled={add.isPending}>
          Add station
        </button>
      </form>
      <ErrorNote message={add.isError ? describeError(add.error) : null} />
      {confirming && (
        <ConfirmBar
          question={`Archive ${confirming.name}?`}
          confirmLabel={`Yes, archive ${confirming.name}`}
          onConfirm={() => archive.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          busy={archive.isPending}
        />
      )}
      <ErrorNote message={archive.isError ? describeError(archive.error) : null} />
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {stations.data?.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-2">
            <span className="font-medium">{s.name}</span>
            <button type="button" className={secondaryButton} onClick={() => setConfirming(s)}>
              Archive
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrinterForm({ stations }: { stations: Station[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<PrinterPurpose>('KOT');
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [mode, setMode] = useState<PrinterMode>('BROWSER');
  const [paperWidthMm, setPaperWidth] = useState<58 | 80>(80);
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const add = useMutation({
    mutationFn: (body: object) => apiFetch('/api/printers', { method: 'POST', body }),
    onSuccess: async () => {
      setName('');
      setAddress('');
      await queryClient.invalidateQueries({ queryKey: printersKey });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = printerSchema.safeParse({
      name: name.trim(),
      purpose,
      stationId: purpose === 'KOT' ? stationId || null : null,
      mode,
      paperWidthMm,
      address: mode === 'AGENT' ? address.trim() || null : null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    add.mutate(parsed.data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3"
    >
      <Field id="printer-name" label="Printer name" error={errors.name}>
        <input
          id="printer-name"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id="printer-purpose" label="Prints">
        <select
          id="printer-purpose"
          className={inputClass}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as PrinterPurpose)}
        >
          <option value="KOT">Kitchen tickets (KOT)</option>
          <option value="BILL">Bills</option>
        </select>
      </Field>
      {purpose === 'KOT' && (
        <Field id="printer-station" label="Station" error={errors.stationId}>
          <select
            id="printer-station"
            className={inputClass}
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
          >
            <option value="">Choose…</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field
        id="printer-mode"
        label="Connection"
        hint="Browser printing works with no extra software."
      >
        <select
          id="printer-mode"
          className={inputClass}
          value={mode}
          onChange={(e) => setMode(e.target.value as PrinterMode)}
        >
          <option value="BROWSER">Browser printing</option>
          <option value="AGENT">Print agent (network printer)</option>
        </select>
      </Field>
      <Field id="printer-width" label="Paper width">
        <select
          id="printer-width"
          className={inputClass}
          value={paperWidthMm}
          onChange={(e) => setPaperWidth(Number(e.target.value) as 58 | 80)}
        >
          <option value={80}>80 mm</option>
          <option value={58}>58 mm</option>
        </select>
      </Field>
      {mode === 'AGENT' && (
        <Field
          id="printer-address"
          label="Network address"
          error={errors.address}
          hint="For example 192.168.1.50"
        >
          <input
            id="printer-address"
            className={inputClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
      )}
      <div className="flex items-end sm:col-span-3">
        <button type="submit" className={primaryButton} disabled={add.isPending}>
          Add printer
        </button>
      </div>
      <div className="sm:col-span-3">
        <ErrorNote message={add.isError ? describeError(add.error) : null} />
      </div>
    </form>
  );
}

function PrintersSection() {
  const queryClient = useQueryClient();
  const stations = useQuery({
    queryKey: stationsKey,
    queryFn: () => apiFetch<Station[]>('/api/stations'),
  });
  const printers = useQuery({
    queryKey: printersKey,
    queryFn: () => apiFetch<Printer[]>('/api/printers'),
  });
  const [confirming, setConfirming] = useState<Printer | null>(null);
  const archive = useMutation({
    mutationFn: (p: Printer) => apiFetch(`/api/printers/${p.id}/archive`, { method: 'POST' }),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: printersKey });
    },
  });

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Printers</h3>
      {stations.data && <PrinterForm stations={stations.data} />}
      {confirming && (
        <ConfirmBar
          question={`Remove ${confirming.name}?`}
          confirmLabel={`Yes, remove ${confirming.name}`}
          onConfirm={() => archive.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          busy={archive.isPending}
        />
      )}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {printers.data?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <div className="flex flex-col">
              <span className="font-medium">{p.name}</span>
              <span className="text-sm text-slate-600">
                {p.purpose === 'KOT' ? `KOTs for ${p.station?.name ?? '—'}` : 'Bills'} ·{' '}
                {p.paperWidthMm} mm ·{' '}
                {p.mode === 'BROWSER' ? 'browser printing' : `agent at ${p.address}`}
              </span>
            </div>
            <button type="button" className={secondaryButton} onClick={() => setConfirming(p)}>
              Remove
            </button>
          </li>
        ))}
        {printers.data?.length === 0 && (
          <li className="px-4 py-2 text-sm text-slate-500">No printers yet.</li>
        )}
      </ul>
    </section>
  );
}

export function KitchenPage() {
  return (
    <section className="flex flex-col gap-8">
      <h2 className="text-xl font-semibold">Kitchen setup</h2>
      <StationsSection />
      <PrintersSection />
    </section>
  );
}
