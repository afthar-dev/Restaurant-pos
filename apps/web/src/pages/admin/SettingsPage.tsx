import {
  outletSettingsSchema,
  paiseToRupeesInput,
  parseRupees,
  PARCEL_PAYMENT_TIMINGS,
  TAX_SCHEMES,
  type ParcelPaymentTiming,
  type TaxScheme,
} from '@rpos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '@/shared/api/http';
import {
  describeError,
  ErrorNote,
  Field,
  fieldErrors,
  inputClass,
  primaryButton,
  type FieldErrors,
} from '@/shared/ui';
import type { OutletSettings } from '@/features/settings';

const TAX_LABEL: Record<TaxScheme, string> = {
  REGULAR: 'GST regular (CGST + SGST on bills)',
  COMPOSITION: 'GST composition (Bill of Supply, no tax on bills)',
  NONE: 'Not GST registered',
};

const PARCEL_LABEL: Record<ParcelPaymentTiming, string> = {
  PAY_FIRST: 'Customer pays before the order is sent',
  PAY_AT_PICKUP: 'Customer pays at pickup',
};

type TextKey = 'name' | 'gstin' | 'address' | 'phone' | 'fssaiNumber' | 'billHeader' | 'billFooter';

interface Draft {
  text: Record<TextKey, string>;
  taxScheme: TaxScheme;
  capPercent: string;
  waiterCanCollectPayment: boolean;
  parcelPaymentTiming: ParcelPaymentTiming;
  bagRupees: string;
}

function toDraft(s: OutletSettings): Draft {
  return {
    text: {
      name: s.name,
      gstin: s.gstin ?? '',
      address: s.address ?? '',
      phone: s.phone ?? '',
      fssaiNumber: s.fssaiNumber ?? '',
      billHeader: s.billHeader ?? '',
      billFooter: s.billFooter ?? '',
    },
    taxScheme: s.taxScheme,
    capPercent: String(s.cashierDiscountCapBp / 100),
    waiterCanCollectPayment: s.waiterCanCollectPayment,
    parcelPaymentTiming: s.parcelPaymentTiming,
    bagRupees: paiseToRupeesInput(s.billPackagingCharge ?? 0),
  };
}

/** Only the fields that differ from what is saved; blank optional text becomes null. */
function changes(saved: OutletSettings, draft: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(draft.text) as TextKey[]) {
    let value: string | null = draft.text[key].trim();
    if (key === 'gstin') value = value.toUpperCase();
    if (value === '' && key !== 'name') value = null;
    if (value !== saved[key]) out[key] = value;
  }
  if (draft.taxScheme !== saved.taxScheme) out.taxScheme = draft.taxScheme;
  const capBp = Math.round(Number(draft.capPercent) * 100);
  if (capBp !== saved.cashierDiscountCapBp) out.cashierDiscountCapBp = capBp;
  if (draft.waiterCanCollectPayment !== saved.waiterCanCollectPayment) {
    out.waiterCanCollectPayment = draft.waiterCanCollectPayment;
  }
  if (draft.parcelPaymentTiming !== saved.parcelPaymentTiming) {
    out.parcelPaymentTiming = draft.parcelPaymentTiming;
  }
  const bag = parseRupees(draft.bagRupees.trim() || '0');
  // An unreadable amount is sent as -1 so the schema check reports it on the field.
  const bagPaise = bag ?? -1;
  if (bagPaise !== (saved.billPackagingCharge ?? 0)) out.billPackagingCharge = bagPaise;
  return out;
}

const ERROR_FIELD: Record<string, string> = {
  cashierDiscountCapBp: 'capPercent',
  billPackagingCharge: 'bagRupees',
};

function SettingsForm({ saved }: { saved: OutletSettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState('');

  useEffect(() => setDraft(toDraft(saved)), [saved]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<OutletSettings>('/api/outlet', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['outlet'], updated);
      setResult('Saved');
    },
  });

  const setText = (key: TextKey) => (value: string) =>
    setDraft((d) => ({ ...d, text: { ...d.text, [key]: value } }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setResult('');
    const body = changes(saved, draft);
    if (Object.keys(body).length === 0) {
      setResult('No changes to save');
      return;
    }
    const parsed = outletSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const raw = fieldErrors(parsed.error);
      setErrors(Object.fromEntries(Object.entries(raw).map(([k, v]) => [ERROR_FIELD[k] ?? k, v])));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const text = (key: TextKey, label: string, hint?: string) => (
    <Field id={`setting-${key}`} label={label} error={errors[key]} hint={hint}>
      <input
        id={`setting-${key}`}
        className={inputClass}
        value={draft.text[key]}
        onChange={(e) => setText(key)(e.target.value)}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <fieldset className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Restaurant details</legend>
        {text('name', 'Restaurant name')}
        {text('phone', 'Phone on bills')}
        {text('address', 'Address on bills')}
        {text('fssaiNumber', 'FSSAI licence number', '14 digits, printed on bills.')}
        {text('billHeader', 'Bill header text')}
        {text('billFooter', 'Bill footer text', 'For example: Thank you, visit again!')}
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Tax</legend>
        {text('gstin', 'GSTIN', 'From the GST certificate. Leave empty if not registered.')}
        <Field id="setting-taxScheme" label="GST scheme">
          <select
            id="setting-taxScheme"
            className={inputClass}
            value={draft.taxScheme}
            onChange={(e) => setDraft((d) => ({ ...d, taxScheme: e.target.value as TaxScheme }))}
          >
            {TAX_SCHEMES.map((s) => (
              <option key={s} value={s}>
                {TAX_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Counter rules</legend>
        <Field
          id="setting-cap"
          label="Cashier discount limit (%)"
          error={errors.capPercent}
          hint="Bigger discounts need a manager's PIN."
        >
          <input
            id="setting-cap"
            type="number"
            min={0}
            max={100}
            step="0.5"
            className={inputClass}
            value={draft.capPercent}
            onChange={(e) => setDraft((d) => ({ ...d, capPercent: e.target.value }))}
          />
        </Field>
        <Field
          id="setting-bag"
          label="Parcel bag charge (₹)"
          error={errors.bagRupees}
          hint="Added once to each parcel bill."
        >
          {' '}
          <input
            id="setting-bag"
            inputMode="decimal"
            className={inputClass}
            value={draft.bagRupees}
            onChange={(e) => setDraft((d) => ({ ...d, bagRupees: e.target.value }))}
          />{' '}
        </Field>
        <Field id="setting-parcel" label="Parcel payment">
          <select
            id="setting-parcel"
            className={inputClass}
            value={draft.parcelPaymentTiming}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                parcelPaymentTiming: e.target.value as ParcelPaymentTiming,
              }))
            }
          >
            {PARCEL_PAYMENT_TIMINGS.map((p) => (
              <option key={p} value={p}>
                {PARCEL_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <input
            type="checkbox"
            checked={draft.waiterCanCollectPayment}
            onChange={(e) => setDraft((d) => ({ ...d, waiterCanCollectPayment: e.target.checked }))}
          />
          Waiters can print bills and collect payment
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          Save settings
        </button>
        <span role="status" aria-label="Save result" className="text-sm text-emerald-800">
          {result}
        </span>
      </div>
      <ErrorNote message={save.isError ? describeError(save.error) : null} />
    </form>
  );
}

export function SettingsPage() {
  const outlet = useQuery({
    queryKey: ['outlet'],
    queryFn: () => apiFetch<OutletSettings>('/api/outlet'),
  });
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Outlet settings</h2>
      {outlet.isPending && <p className="text-slate-500">Loading…</p>}
      <ErrorNote message={outlet.isError ? describeError(outlet.error) : null} />
      {outlet.data && <SettingsForm saved={outlet.data} />}
    </section>
  );
}
