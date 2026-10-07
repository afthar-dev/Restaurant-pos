import { FOOD_LABEL, type MenuAddonGroup, type MenuCategory, type MenuItem, menuKeys } from '..';
import {
  FOOD_TYPES,
  itemSchema,
  paiseToRupeesInput,
  parseRupees,
  type FoodType,
} from '@rpos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/shared/api/http';
import {
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import type { TaxRate } from '@/features/tax/pages/TaxPage';

interface VariantRow {
  key: number;
  id?: string;
  name: string;
  dineIn: string;
  parcel: string;
  packaging: string;
}

interface ComponentRow {
  key: number;
  variantId: string;
  quantity: string;
}

const PRICE_ERROR = 'Enter a price like 120 or 120.50';
let nextKey = 1;

function variantRows(item: MenuItem | null): VariantRow[] {
  if (!item) return [{ key: nextKey++, name: 'Regular', dineIn: '', parcel: '', packaging: '' }];
  return item.variants.map((v) => ({
    key: nextKey++,
    id: v.id,
    name: v.name,
    dineIn: paiseToRupeesInput(v.dineInPrice),
    parcel: v.parcelPrice === v.dineInPrice ? '' : paiseToRupeesInput(v.parcelPrice),
    packaging: v.packagingCharge === 0 ? '' : paiseToRupeesInput(v.packagingCharge),
  }));
}

/** Optional price box: empty means "not set". */
function optionalPrice(value: string): number | undefined | null {
  if (value.trim() === '') return undefined;
  return parseRupees(value);
}

export function ItemEditor({
  existing,
  categories,
  defaultCategoryId,
  taxRates,
  addonGroups,
  onDone,
}: {
  existing: MenuItem | null;
  categories: MenuCategory[];
  defaultCategoryId: string;
  taxRates: TaxRate[];
  addonGroups: MenuAddonGroup[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [foodType, setFoodType] = useState<FoodType>(existing?.foodType ?? 'VEG');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? defaultCategoryId);
  const [taxRateId, setTaxRateId] = useState(existing?.taxRate.id ?? taxRates[0]?.id ?? '');
  const [variants, setVariants] = useState<VariantRow[]>(() => variantRows(existing));
  const [groupIds, setGroupIds] = useState<string[]>(existing?.addonGroups.map((g) => g.id) ?? []);
  const [isCombo, setIsCombo] = useState(existing?.isCombo ?? false);
  const [components, setComponents] = useState<ComponentRow[]>(
    existing?.components.map((c) => ({
      key: nextKey++,
      variantId: c.variantId,
      quantity: String(c.quantity),
    })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (body: object) =>
      existing
        ? apiFetch(`/api/menu/items/${existing.id}`, { method: 'PUT', body })
        : apiFetch('/api/menu/items', { method: 'POST', body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuKeys.all });
      onDone();
    },
  });

  const comboOptions = categories.flatMap((c) =>
    c.items
      .filter((i) => !i.isCombo && i.id !== existing?.id)
      .flatMap((i) => i.variants.map((v) => ({ id: v.id, label: `${i.name} – ${v.name}` }))),
  );

  const updateVariant = (key: number, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    const variantBodies = variants.map((row, index) => {
      const dineInPrice = parseRupees(row.dineIn);
      const parcelPrice = optionalPrice(row.parcel);
      const packagingCharge = optionalPrice(row.packaging);
      if (dineInPrice === null) found[`variant-${index}-dineIn`] = PRICE_ERROR;
      if (parcelPrice === null) found[`variant-${index}-parcel`] = PRICE_ERROR;
      if (packagingCharge === null) found[`variant-${index}-packaging`] = PRICE_ERROR;
      return {
        ...(row.id ? { id: row.id } : {}),
        name: row.name.trim(),
        dineInPrice: dineInPrice ?? 0,
        ...(parcelPrice ? { parcelPrice } : {}),
        ...(packagingCharge ? { packagingCharge } : {}),
      };
    });

    const body = {
      categoryId,
      name: name.trim(),
      description: description.trim() || null,
      foodType,
      taxRateId,
      variants: variantBodies,
      addonGroupIds: groupIds,
      isCombo,
      components: isCombo
        ? components.map((c) => ({ variantId: c.variantId, quantity: Number(c.quantity) }))
        : [],
    };
    const parsed = itemSchema.safeParse(body);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [first, index, field] = issue.path;
        const key =
          first === 'variants' && typeof index === 'number'
            ? `variant-${index}-${String(field)}`
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
      className="flex flex-col gap-5 rounded-lg border border-emerald-200 bg-white p-4"
    >
      <h3 className="text-lg font-semibold">{existing ? `Edit ${existing.name}` : 'New item'}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="item-name" label="Item name" error={errors.name}>
          <input
            id="item-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="item-food" label="Type">
          <select
            id="item-food"
            className={inputClass}
            value={foodType}
            onChange={(e) => setFoodType(e.target.value as FoodType)}
          >
            {FOOD_TYPES.map((f) => (
              <option key={f} value={f}>
                {FOOD_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="item-category" label="Category" error={errors.categoryId}>
          <select
            id="item-category"
            className={inputClass}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="item-tax" label="Tax rate" error={errors.taxRateId}>
          <select
            id="item-tax"
            className={inputClass}
            value={taxRateId}
            onChange={(e) => setTaxRateId(e.target.value)}
          >
            {taxRates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field id="item-description" label="Description (optional)">
            <input
              id="item-description"
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Sizes and prices</legend>
        <p className="text-xs text-slate-500">
          Leave parcel price empty to use the dine-in price. Packaging is added to parcel orders
          only.
        </p>
        {variants.map((row, index) => {
          const n = index + 1;
          return (
            <div
              key={row.key}
              className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] sm:items-end"
            >
              <Field
                id={`variant-${row.key}-name`}
                label={`Size ${n} name`}
                error={errors[`variant-${index}-name`]}
              >
                <input
                  id={`variant-${row.key}-name`}
                  className={inputClass}
                  value={row.name}
                  onChange={(e) => updateVariant(row.key, { name: e.target.value })}
                />
              </Field>
              <Field
                id={`variant-${row.key}-dinein`}
                label={`Size ${n} dine-in price (₹)`}
                error={errors[`variant-${index}-dineIn`] ?? errors[`variant-${index}-dineInPrice`]}
              >
                <input
                  id={`variant-${row.key}-dinein`}
                  inputMode="decimal"
                  className={inputClass}
                  value={row.dineIn}
                  onChange={(e) => updateVariant(row.key, { dineIn: e.target.value })}
                />
              </Field>
              <Field
                id={`variant-${row.key}-parcel`}
                label={`Size ${n} parcel price (₹)`}
                error={errors[`variant-${index}-parcel`]}
              >
                <input
                  id={`variant-${row.key}-parcel`}
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="Same"
                  value={row.parcel}
                  onChange={(e) => updateVariant(row.key, { parcel: e.target.value })}
                />
              </Field>
              <Field
                id={`variant-${row.key}-packaging`}
                label={`Size ${n} packaging (₹)`}
                error={errors[`variant-${index}-packaging`]}
              >
                <input
                  id={`variant-${row.key}-packaging`}
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="0"
                  value={row.packaging}
                  onChange={(e) => updateVariant(row.key, { packaging: e.target.value })}
                />
              </Field>
              <button
                type="button"
                className={secondaryButton}
                disabled={variants.length === 1}
                onClick={() => setVariants((rows) => rows.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
            </div>
          );
        })}
        {errors.variants && <p className="text-sm text-red-700">{errors.variants}</p>}
        <button
          type="button"
          className={`${secondaryButton} self-start`}
          onClick={() =>
            setVariants((rows) => [
              ...rows,
              { key: nextKey++, name: '', dineIn: '', parcel: '', packaging: '' },
            ])
          }
        >
          Add size
        </button>
      </fieldset>

      {addonGroups.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Add-ons offered</legend>
          {addonGroups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={groupIds.includes(g.id)}
                onChange={(e) =>
                  setGroupIds((ids) =>
                    e.target.checked ? [...ids, g.id] : ids.filter((x) => x !== g.id),
                  )
                }
              />
              {g.name}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={isCombo} onChange={(e) => setIsCombo(e.target.checked)} />
          This is a combo
        </label>
        {isCombo && (
          <>
            {components.map((c, index) => (
              <div key={c.key} className="flex flex-wrap items-end gap-2">
                <Field id={`component-${c.key}`} label={`Combo item ${index + 1}`}>
                  <select
                    id={`component-${c.key}`}
                    className={inputClass}
                    value={c.variantId}
                    onChange={(e) =>
                      setComponents((rows) =>
                        rows.map((r) =>
                          r.key === c.key ? { ...r, variantId: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    {comboOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`component-qty-${c.key}`} label="Quantity">
                  <input
                    id={`component-qty-${c.key}`}
                    type="number"
                    min={1}
                    max={20}
                    className={`${inputClass} w-20`}
                    value={c.quantity}
                    onChange={(e) =>
                      setComponents((rows) =>
                        rows.map((r) => (r.key === c.key ? { ...r, quantity: e.target.value } : r)),
                      )
                    }
                  />
                </Field>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setComponents((rows) => rows.filter((r) => r.key !== c.key))}
                >
                  Remove
                </button>
              </div>
            ))}
            {errors.components && <p className="text-sm text-red-700">{errors.components}</p>}
            <button
              type="button"
              className={`${secondaryButton} self-start`}
              disabled={comboOptions.length === 0}
              onClick={() =>
                setComponents((rows) => [
                  ...rows,
                  { key: nextKey++, variantId: comboOptions[0]?.id ?? '', quantity: '1' },
                ])
              }
            >
              Add item to combo
            </button>
          </>
        )}
      </fieldset>

      <ErrorNote message={save.isError ? describeError(save.error) : null} />
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          Save item
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
