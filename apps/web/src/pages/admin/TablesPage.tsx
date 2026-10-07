import { QrStickers } from './QrStickers';
import { areaSchema, tableSchema } from '@rpos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/shared/api/http';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  fieldErrors,
  inputClass,
  primaryButton,
  RenameForm,
  secondaryButton,
  type FieldErrors,
} from '@/shared/ui';

export interface FloorTable {
  id: string;
  name: string;
  seats: number;
}

export interface FloorArea {
  id: string;
  name: string;
  sortOrder: number;
  tables: FloorTable[];
}

export const floorKey = ['floor'];

type Pending = { kind: 'area'; area: FloorArea } | { kind: 'table'; table: FloorTable };

function AddTableForm({ area }: { area: FloorArea }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('4');
  const [errors, setErrors] = useState<FieldErrors>({});
  const add = useMutation({
    mutationFn: (body: object) => apiFetch('/api/tables', { method: 'POST', body }),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: floorKey });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = tableSchema.safeParse({
      areaId: area.id,
      name: name.trim(),
      seats: Number(seats),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    add.mutate(parsed.data);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-3">
      <Field id={`table-name-${area.id}`} label="Table name" error={errors.name}>
        <input
          id={`table-name-${area.id}`}
          className={inputClass}
          placeholder="T1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id={`table-seats-${area.id}`} label="Seats" error={errors.seats}>
        <input
          id={`table-seats-${area.id}`}
          type="number"
          min={1}
          max={50}
          className={`${inputClass} w-24`}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
        />
      </Field>
      <button type="submit" className={secondaryButton} disabled={add.isPending}>
        Add table
      </button>
      <ErrorNote message={add.isError ? describeError(add.error) : null} />
    </form>
  );
}

/** Edits a table in place, keeping its id and printed QR code. */
function EditTableForm({
  table,
  area,
  areas,
  onDone,
}: {
  table: FloorTable;
  area: FloorArea;
  areas: FloorArea[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(table.name);
  const [seats, setSeats] = useState(String(table.seats));
  const [areaId, setAreaId] = useState(area.id);
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useMutation({
    mutationFn: (body: object) => apiFetch(`/api/tables/${table.id}`, { method: 'PUT', body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: floorKey });
      onDone();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = tableSchema.safeParse({ areaId, name: name.trim(), seats: Number(seats) });
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
      className="flex flex-wrap items-end gap-3 rounded-md border border-emerald-200 p-3"
    >
      <Field
        id={`edit-table-name-${table.id}`}
        label={`Name for ${table.name}`}
        error={errors.name}
      >
        <input
          id={`edit-table-name-${table.id}`}
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        id={`edit-table-seats-${table.id}`}
        label={`Seats for ${table.name}`}
        error={errors.seats}
      >
        <input
          id={`edit-table-seats-${table.id}`}
          type="number"
          min={1}
          max={50}
          className={`${inputClass} w-24`}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
        />
      </Field>
      <Field id={`edit-table-area-${table.id}`} label={`Area for ${table.name}`}>
        <select
          id={`edit-table-area-${table.id}`}
          className={inputClass}
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className={primaryButton} disabled={save.isPending}>
        Save table
      </button>
      <button type="button" className={secondaryButton} onClick={onDone}>
        Cancel
      </button>
      <ErrorNote message={save.isError ? describeError(save.error) : null} />
    </form>
  );
}

function AddAreaForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const add = useMutation({
    mutationFn: (body: object) => apiFetch('/api/areas', { method: 'POST', body }),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: floorKey });
    },
  });
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = areaSchema.safeParse({ name: name.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    add.mutate(parsed.data);
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-end gap-3">
      <Field
        id="area-name"
        label="New area"
        error={error}
        hint="For example AC Hall, Outdoor, Family section."
      >
        <input
          id="area-name"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <button type="submit" className={primaryButton} disabled={add.isPending}>
        Add area
      </button>
      <ErrorNote message={add.isError ? describeError(add.error) : null} />
    </form>
  );
}

export function TablesPage() {
  const queryClient = useQueryClient();
  const floor = useQuery({
    queryKey: floorKey,
    queryFn: () => apiFetch<FloorArea[]>('/api/floor'),
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [renamingArea, setRenamingArea] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState<string | null>(null);

  const archive = useMutation({
    mutationFn: (p: Pending) =>
      p.kind === 'area'
        ? apiFetch(`/api/areas/${p.area.id}/archive`, { method: 'POST' })
        : apiFetch(`/api/tables/${p.table.id}/archive`, { method: 'POST' }),
    onSuccess: async () => {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: floorKey });
    },
  });
  const renameArea = useMutation({
    mutationFn: ({ area, name }: { area: FloorArea; name: string }) =>
      apiFetch(`/api/areas/${area.id}`, {
        method: 'PUT',
        body: { name, sortOrder: area.sortOrder },
      }),
    onSuccess: async () => {
      setRenamingArea(null);
      await queryClient.invalidateQueries({ queryKey: floorKey });
    },
  });

  const pendingName = pending
    ? pending.kind === 'area'
      ? pending.area.name
      : pending.table.name
    : '';
  const areas = floor.data ?? [];

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Tables</h2>
      <AddAreaForm />
      <QrStickers />
      {pending && (
        <ConfirmBar
          question={`Archive ${pendingName}?`}
          confirmLabel={`Yes, archive ${pendingName}`}
          onConfirm={() => archive.mutate(pending)}
          onCancel={() => setPending(null)}
          busy={archive.isPending}
        />
      )}
      <ErrorNote message={archive.isError ? describeError(archive.error) : null} />
      <ErrorNote message={floor.isError ? describeError(floor.error) : null} />
      {areas.map((area) => {
        const editing = area.tables.find((t) => t.id === editingTable);
        return (
          <section
            key={area.id}
            className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            {renamingArea === area.id ? (
              <RenameForm
                id={`area-rename-${area.id}`}
                current={area.name}
                busy={renameArea.isPending}
                error={renameArea.isError ? describeError(renameArea.error) : null}
                onSave={(name) => renameArea.mutate({ area, name })}
                onCancel={() => setRenamingArea(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{area.name}</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Rename ${area.name}`}
                    className={secondaryButton}
                    onClick={() => setRenamingArea(area.id)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setPending({ kind: 'area', area })}
                  >
                    Archive area
                  </button>
                </div>
              </div>
            )}
            <ul className="flex flex-wrap gap-2">
              {area.tables.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-slate-500">{t.seats} seats</span>
                  <button
                    type="button"
                    aria-label={`Edit table ${t.name}`}
                    className="text-slate-500 hover:text-emerald-800"
                    onClick={() => setEditingTable(t.id)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label={`Archive table ${t.name}`}
                    className="text-slate-400 hover:text-red-700"
                    onClick={() => setPending({ kind: 'table', table: t })}
                  >
                    ×
                  </button>
                </li>
              ))}
              {area.tables.length === 0 && (
                <li className="text-sm text-slate-500">No tables yet.</li>
              )}
            </ul>
            {editing && (
              <EditTableForm
                key={editing.id}
                table={editing}
                area={area}
                areas={areas}
                onDone={() => setEditingTable(null)}
              />
            )}
            <AddTableForm area={area} />
          </section>
        );
      })}
    </section>
  );
}
