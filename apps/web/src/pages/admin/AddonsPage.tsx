import { addonGroupSchema, paiseToRupeesInput, parseRupees } from '@rpos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/shared/api/http';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import { rupees } from '@/shared/lib/money';
import { addonGroupsKey, menuKey, type MenuAddonGroup } from '@/features/menu/types';

interface Row {
  key: number;
  id?: string;
  name: string;
  price: string;
}

let nextKey = 1;

function GroupForm({ existing, onDone }: { existing: MenuAddonGroup | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? '');
  const [minSelect, setMin] = useState(String(existing?.minSelect ?? 0));
  const [maxSelect, setMax] = useState(String(existing?.maxSelect ?? 1));
  const [rows, setRows] = useState<Row[]>(
    existing?.addons.map((a) => ({
      key: nextKey++,
      id: a.id,
      name: a.name,
      price: paiseToRupeesInput(a.price),
    })) ?? [{ key: nextKey++, name: '', price: '' }],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: object) =>
      existing
        ? apiFetch(`/api/menu/addon-groups/${existing.id}`, { method: 'PUT', body })
        : apiFetch('/api/menu/addon-groups', { method: 'POST', body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: addonGroupsKey });
      await queryClient.invalidateQueries({ queryKey: menuKey });
      onDone();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    const addons = rows.map((r, index) => {
      const price = parseRupees(r.price.trim() === '' ? '0' : r.price);
      if (price === null) found[`addon-${index}-price`] = 'Enter a price like 30 or 30.50';
      return { ...(r.id ? { id: r.id } : {}), name: r.name.trim(), price: price ?? 0 };
    });
    const parsed = addonGroupSchema.safeParse({
      name: name.trim(),
      minSelect: Number(minSelect),
      maxSelect: Number(maxSelect),
      addons,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [first, index, field] = issue.path;
        const key =
          first === 'addons' && typeof index === 'number'
            ? `addon-${index}-${String(field)}`
            : String(first);
        found[key] ??= issue.message;
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0 || !parsed.success) return;
    save.mutate(parsed.data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-emerald-200 bg-white p-4"
    >
      <h3 className="text-lg font-semibold">
        {existing ? `Edit ${existing.name}` : 'New add-on group'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          id="group-name"
          label="Group name"
          error={errors.name}
          hint="For example Extras, Spice level, Breads."
        >
          <input
            id="group-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="group-min" label="Customer must pick at least" error={errors.minSelect}>
          <input
            id="group-min"
            type="number"
            min={0}
            className={inputClass}
            value={minSelect}
            onChange={(e) => setMin(e.target.value)}
          />
        </Field>
        <Field id="group-max" label="Customer can pick up to" error={errors.maxSelect}>
          <input
            id="group-max"
            type="number"
            min={1}
            className={inputClass}
            value={maxSelect}
            onChange={(e) => setMax(e.target.value)}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Options</legend>
        {rows.map((r, index) => (
          <div key={r.key} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <Field
              id={`addon-${r.key}-name`}
              label={`Option ${index + 1} name`}
              error={errors[`addon-${index}-name`]}
            >
              <input
                id={`addon-${r.key}-name`}
                className={inputClass}
                value={r.name}
                onChange={(e) =>
                  setRows((all) =>
                    all.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
            </Field>
            <Field
              id={`addon-${r.key}-price`}
              label={`Option ${index + 1} price (₹)`}
              error={errors[`addon-${index}-price`]}
            >
              <input
                id={`addon-${r.key}-price`}
                inputMode="decimal"
                placeholder="0"
                className={inputClass}
                value={r.price}
                onChange={(e) =>
                  setRows((all) =>
                    all.map((x) => (x.key === r.key ? { ...x, price: e.target.value } : x)),
                  )
                }
              />
            </Field>
            <button
              type="button"
              className={secondaryButton}
              disabled={rows.length === 1}
              onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
            >
              Remove
            </button>
          </div>
        ))}
        {errors.addons && <p className="text-sm text-red-700">{errors.addons}</p>}
        <button
          type="button"
          className={`${secondaryButton} self-start`}
          onClick={() => setRows((all) => [...all, { key: nextKey++, name: '', price: '' }])}
        >
          Add option
        </button>
      </fieldset>
      <ErrorNote message={save.isError ? describeError(save.error) : null} />
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          Save group
        </button>
        {existing && (
          <button type="button" className={secondaryButton} onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function AddonsPage() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: addonGroupsKey,
    queryFn: () => apiFetch<MenuAddonGroup[]>('/api/menu/addon-groups'),
  });
  const [editing, setEditing] = useState<MenuAddonGroup | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [confirming, setConfirming] = useState<MenuAddonGroup | null>(null);

  const archive = useMutation({
    mutationFn: (g: MenuAddonGroup) =>
      apiFetch(`/api/menu/addon-groups/${g.id}/archive`, { method: 'POST' }),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: addonGroupsKey });
      await queryClient.invalidateQueries({ queryKey: menuKey });
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Add-ons</h2>
      <GroupForm
        key={editing ? editing.id : `new-${formKey}`}
        existing={editing}
        onDone={() => {
          setEditing(null);
          setFormKey((k) => k + 1);
        }}
      />
      {confirming && (
        <ConfirmBar
          question={`Archive ${confirming.name}? Items stop offering these options.`}
          confirmLabel={`Yes, archive ${confirming.name}`}
          onConfirm={() => archive.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          busy={archive.isPending}
        />
      )}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {groups.data?.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{g.name}</span>
              <span className="text-sm text-slate-600">
                {g.addons
                  .map((a) => `${a.name} ${a.price === 0 ? 'free' : rupees(a.price)}`)
                  .join(' · ')}
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" className={secondaryButton} onClick={() => setEditing(g)}>
                Edit
              </button>
              <button type="button" className={secondaryButton} onClick={() => setConfirming(g)}>
                Archive
              </button>
            </div>
          </li>
        ))}
        {groups.data?.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-500">No add-on groups yet.</li>
        )}
      </ul>
    </section>
  );
}
