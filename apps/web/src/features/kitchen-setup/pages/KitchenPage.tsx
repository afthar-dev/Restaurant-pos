import { printerSchema, stationSchema, type PrinterMode, type PrinterPurpose } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import { useDevices } from '@/features/devices';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  fieldErrors,
  type FieldErrors,
  inputClass,
  PageHeader,
  primaryButton,
  RenameForm,
  secondaryButton,
} from '@/shared/ui';

import {
  useAddStation,
  useArchivePrinter,
  useArchiveStation,
  useRenameStation,
  useSavePrinter,
} from '../mutations';
import { usePrinters, useStations } from '../queries';
import type { Printer, Station } from '../types';

function StationsSection() {
  const stations = useStations();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<Station | null>(null);
  const [renaming, setRenaming] = useState<Station | null>(null);

  const add = useAddStation(() => setName(''));
  const rename = useRenameStation(() => setRenaming(null));
  const archive = useArchiveStation(() => setConfirming(null));

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
        <p className="text-sm text-muted">
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
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {stations.data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            {renaming?.id === s.id ? (
              <RenameForm
                id={`station-rename-${s.id}`}
                current={s.name}
                busy={rename.isPending}
                error={rename.isError ? describeError(rename.error) : null}
                onSave={(newName) => rename.mutate({ id: s.id, name: newName })}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <>
                <span className="font-medium">{s.name}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Rename ${s.name}`}
                    className={secondaryButton}
                    onClick={() => setRenaming(s)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    aria-label={`Archive ${s.name}`}
                    className={secondaryButton}
                    onClick={() => setConfirming(s)}
                  >
                    Archive
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PrinterForm({
  stations,
  existing,
  onDone,
}: {
  stations: Station[];
  existing: Printer | null;
  onDone: () => void;
}) {
  const key = existing?.id ?? 'new';
  const [name, setName] = useState(existing?.name ?? '');
  const [purpose, setPurpose] = useState<PrinterPurpose>(existing?.purpose ?? 'KOT');
  const [stationId, setStationId] = useState(existing?.station?.id ?? stations[0]?.id ?? '');
  const [mode, setMode] = useState<PrinterMode>(existing?.mode ?? 'BROWSER');
  const [paperWidthMm, setPaperWidth] = useState<58 | 80>(
    (existing?.paperWidthMm as 58 | 80 | undefined) ?? 80,
  );
  const [address, setAddress] = useState(existing?.address ?? '');
  const [deviceId, setDeviceId] = useState(existing?.device?.id ?? '');
  const devices = useDevices();
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = useSavePrinter(existing, () => {
    if (!existing) {
      setName('');
      setAddress('');
    }
    onDone();
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
      deviceId: deviceId || null,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3"
    >
      {existing && <h4 className="font-semibold sm:col-span-3">Edit {existing.name}</h4>}
      <Field id={`printer-${key}-name`} label="Printer name" error={errors.name}>
        <input
          id={`printer-${key}-name`}
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id={`printer-${key}-purpose`} label="Prints">
        <select
          id={`printer-${key}-purpose`}
          className={inputClass}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as PrinterPurpose)}
        >
          <option value="KOT">Kitchen tickets (KOT)</option>
          <option value="BILL">Bills</option>
        </select>
      </Field>
      {purpose === 'KOT' && (
        <Field id={`printer-${key}-station`} label="Station" error={errors.stationId}>
          <select
            id={`printer-${key}-station`}
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
        id={`printer-${key}-mode`}
        label="Connection"
        hint="Browser printing works with no extra software."
      >
        <select
          id={`printer-${key}-mode`}
          className={inputClass}
          value={mode}
          onChange={(e) => setMode(e.target.value as PrinterMode)}
        >
          <option value="BROWSER">Browser printing</option>
          <option value="AGENT">Print agent (network printer)</option>
        </select>
      </Field>
      <Field id={`printer-${key}-width`} label="Paper width">
        <select
          id={`printer-${key}-width`}
          className={inputClass}
          value={paperWidthMm}
          onChange={(e) => setPaperWidth(Number(e.target.value) as 58 | 80)}
        >
          <option value={80}>80 mm</option>
          <option value={58}>58 mm</option>
        </select>
      </Field>
      <Field
        id={`printer-${key}-device`}
        label="Printed by"
        hint={
          mode === 'BROWSER'
            ? 'The counter or kitchen screen the printer is plugged into.'
            : 'The registered print agent that reaches this printer.'
        }
      >
        <select
          id={`printer-${key}-device`}
          className={inputClass}
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        >
          <option value="">Not set up yet</option>
          {devices.data
            ?.filter((d) => !d.revokedAt)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </Field>
      {mode === 'AGENT' && (
        <Field
          id={`printer-${key}-address`}
          label="Network address"
          error={errors.address}
          hint="For example 192.168.1.50"
        >
          <input
            id={`printer-${key}-address`}
            className={inputClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
      )}
      <div className="flex items-end gap-2 sm:col-span-3">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          {existing ? 'Save printer' : 'Add printer'}
        </button>
        {existing && (
          <button type="button" className={secondaryButton} onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
      <div className="sm:col-span-3">
        <ErrorNote message={save.isError ? describeError(save.error) : null} />
      </div>
    </form>
  );
}

function PrintersSection() {
  const stations = useStations();
  const printers = usePrinters();
  const [confirming, setConfirming] = useState<Printer | null>(null);
  const [editing, setEditing] = useState<Printer | null>(null);
  const archive = useArchivePrinter(() => setConfirming(null));

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Printers</h3>
      {stations.data && (
        <PrinterForm stations={stations.data} existing={null} onDone={() => undefined} />
      )}
      {confirming && (
        <ConfirmBar
          question={`Remove ${confirming.name}?`}
          confirmLabel={`Yes, remove ${confirming.name}`}
          onConfirm={() => archive.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          busy={archive.isPending}
        />
      )}
      {editing && stations.data && (
        <PrinterForm
          key={editing.id}
          stations={stations.data}
          existing={editing}
          onDone={() => setEditing(null)}
        />
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {printers.data?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
            <div className="flex flex-col">
              <span className="font-medium">{p.name}</span>
              <span className="text-sm text-muted">
                {p.purpose === 'KOT' ? `KOTs for ${p.station?.name ?? '—'}` : 'Bills'} ·{' '}
                {p.paperWidthMm} mm ·{' '}
                {p.mode === 'BROWSER'
                  ? `browser printing on ${p.device?.name ?? 'no device yet'}`
                  : `agent at ${p.address}`}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label={`Edit ${p.name}`}
                className={secondaryButton}
                onClick={() => setEditing(p)}
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                className={secondaryButton}
                onClick={() => setConfirming(p)}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
        {printers.data?.length === 0 && (
          <li className="px-4 py-2 text-sm text-subtle">No printers yet.</li>
        )}
      </ul>
    </section>
  );
}

export function KitchenPage() {
  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        as="h2"
        title="Kitchen setup"
        description="Stations receive kitchen tickets for their categories; printers print tickets and bills."
      />
      <StationsSection />
      <PrintersSection />
    </section>
  );
}
