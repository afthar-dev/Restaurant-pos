import { parseRupees, taxRateSchema } from '@rpos/shared';
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
  secondaryButton,
  type FieldErrors,
} from '@/shared/ui';

export interface TaxRate {
  id: string;
  name: string;
  cgstBp: number;
  sgstBp: number;
  totalBp: number;
  archivedAt: string | null;
}

export const taxRatesKey = ['tax-rates'];

/** 250 → "2.5%", 900 → "9%". */
export function percent(bp: number): string {
  return `${(bp / 100).toString()}%`;
}

function TaxForm({ existing, onDone }: { existing: TaxRate | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? '');
  const [rate, setRate] = useState(existing ? String(existing.totalBp / 100) : '');
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = useMutation({
    mutationFn: (body: object) =>
      existing
        ? apiFetch(`/api/tax-rates/${existing.id}`, { method: 'PUT', body })
        : apiFetch('/api/tax-rates', { method: 'POST', body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taxRatesKey });
      if (existing) onDone();
      else {
        setName('');
        setRate('');
      }
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const totalBp = parseRupees(rate);
    if (totalBp === null) {
      setErrors({ totalBp: 'Enter a percentage like 5 or 18' });
      return;
    }
    const parsed = taxRateSchema.safeParse({ name: name.trim(), totalBp });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const idPrefix = existing ? `tax-${existing.id}` : 'tax-new';
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
    >
      <Field id={`${idPrefix}-name`} label="Name" error={errors.name}>
        <input
          id={`${idPrefix}-name`}
          className={inputClass}
          placeholder="GST 5%"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        id={`${idPrefix}-rate`}
        label="Total GST (%)"
        error={errors.totalBp}
        hint="Split equally into CGST and SGST."
      >
        <input
          id={`${idPrefix}-rate`}
          inputMode="decimal"
          className={inputClass}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          {existing ? 'Save' : 'Add tax rate'}
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

export function TaxPage() {
  const queryClient = useQueryClient();
  const rates = useQuery({
    queryKey: taxRatesKey,
    queryFn: () => apiFetch<TaxRate[]>('/api/tax-rates'),
  });
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [confirming, setConfirming] = useState<TaxRate | null>(null);

  const archive = useMutation({
    mutationFn: (r: TaxRate) => apiFetch(`/api/tax-rates/${r.id}/archive`, { method: 'POST' }),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: taxRatesKey });
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Tax rates</h2>
        <p className="text-sm text-slate-600">
          Most restaurants charge 5% GST. Ask your accountant if you are unsure which rate applies.
        </p>
      </div>
      {editing ? (
        <TaxForm existing={editing} onDone={() => setEditing(null)} />
      ) : (
        <TaxForm existing={null} onDone={() => undefined} />
      )}
      {confirming && (
        <ConfirmBar
          question={`Archive ${confirming.name}? Items using it must be moved to another rate first.`}
          confirmLabel={`Yes, archive ${confirming.name}`}
          onConfirm={() => archive.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          busy={archive.isPending}
        />
      )}
      <ErrorNote message={archive.isError ? describeError(archive.error) : null} />
      <ErrorNote message={rates.isError ? describeError(rates.error) : null} />
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rates.data?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-col">
              <span className="font-medium">{r.name}</span>
              <span className="text-sm text-slate-600">
                {percent(r.cgstBp)} + {percent(r.sgstBp)}
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" className={secondaryButton} onClick={() => setEditing(r)}>
                Edit
              </button>
              <button type="button" className={secondaryButton} onClick={() => setConfirming(r)}>
                Archive
              </button>
            </div>
          </li>
        ))}
        {rates.data?.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-500">No tax rates yet.</li>
        )}
      </ul>
    </section>
  );
}
