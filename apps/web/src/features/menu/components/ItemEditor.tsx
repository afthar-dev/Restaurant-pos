import {
  FOOD_TYPES,
  itemSchema,
  paiseToRupeesInput,
  parseRupees,
  type FoodType,
} from '@rpos/shared';
import { Image as ImageIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNotify } from '@/features/notifications';
import {
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import type { TaxRate } from '@/features/tax';
import { useItemPhoto, useSaveItem } from '../mutations';
import { shrinkPhoto } from '@/shared/lib/photo';
import { FOOD_LABEL, type MenuAddonGroup, type MenuCategory, type MenuItem } from '../types';

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

type PhotoChange =
  { kind: 'keep' } | { kind: 'set'; blob: Blob; preview: string } | { kind: 'remove' };

function variantRows(item: MenuItem | null, keepIds = true): VariantRow[] {
  if (!item) return [{ key: nextKey++, name: 'Regular', dineIn: '', parcel: '', packaging: '' }];
  return item.variants.map((v) => ({
    key: nextKey++,
    id: keepIds ? v.id : undefined,
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
  copyFrom = null,
}: {
  existing: MenuItem | null;
  /** Pre-fills a new dish from this one (Duplicate). */
  copyFrom?: MenuItem | null;
  categories: MenuCategory[];
  defaultCategoryId: string;
  taxRates: TaxRate[];
  addonGroups: MenuAddonGroup[];
  onDone: () => void;
}) {
  const source = existing ?? copyFrom;
  const [name, setName] = useState(existing?.name ?? (copyFrom ? `${copyFrom.name} (copy)` : ''));
  const [description, setDescription] = useState(source?.description ?? '');
  const [foodType, setFoodType] = useState<FoodType>(source?.foodType ?? 'VEG');
  const [categoryId, setCategoryId] = useState(source?.categoryId ?? defaultCategoryId);
  // '' means no GST (saved as null).
  const [taxRateId, setTaxRateId] = useState(
    source ? (source.taxRate?.id ?? '') : (taxRates[0]?.id ?? ''),
  );
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    variantRows(source, Boolean(existing)),
  );
  const [groupIds, setGroupIds] = useState<string[]>(source?.addonGroups.map((g) => g.id) ?? []);
  const [isCombo, setIsCombo] = useState(source?.isCombo ?? false);
  const [components, setComponents] = useState<ComponentRow[]>(
    source?.components.map((c) => ({
      key: nextKey++,
      variantId: c.variantId,
      quantity: String(c.quantity),
    })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const notify = useNotify();
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoMutation = useItemPhoto();
  useEffect(
    () => () => {
      if (photo.kind === 'set') URL.revokeObjectURL(photo.preview);
    },
    [photo],
  );

  async function afterSave(saved: MenuItem) {
    if (photo.kind === 'keep') return onDone();
    setPhotoBusy(true);
    try {
      const blob = photo.kind === 'set' ? photo.blob : null;
      await photoMutation.mutateAsync({ itemId: saved.id, photo: blob });
    } catch (error) {
      // The dish is saved; only the photo failed. Close and say so rather than risk a second save.
      notify({
        text: `${saved.name} is saved, but its photo was not: ${describeError(error)}`,
        tone: 'warning',
        ttlMs: 15_000,
      });
    } finally {
      setPhotoBusy(false);
    }
    onDone();
  }
  const save = useSaveItem(existing, (saved) => void afterSave(saved));

  const shown =
    photo.kind === 'set'
      ? photo.preview
      : photo.kind === 'remove'
        ? null
        : (existing?.imageUrl ?? null);

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
      taxRateId: taxRateId || null,
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
      className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4"
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
        <Field
          id="item-tax"
          label="GST"
          error={errors.taxRateId}
          hint={
            taxRateId === ''
              ? 'No GST: charged at exactly this price. Use it only for GST-exempt items, or if the restaurant is not GST-registered.'
              : undefined
          }
        >
          <select
            id="item-tax"
            className={inputClass}
            value={taxRateId}
            onChange={(e) => setTaxRateId(e.target.value)}
          >
            {taxRates.map((t) => (
              <option key={t.id} value={t.id}>
                {`${t.name}, added on top`}
              </option>
            ))}
            <option value="">No GST (fixed price)</option>
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

      <section aria-label="Photo" className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-subtle">
          {shown ? (
            <img
              src={shown}
              alt={`Photo of ${name.trim() || 'this dish'}`}
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon aria-hidden="true" className="size-6" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label
            className={`${secondaryButton} min-h-11 cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-600`}
          >
            {shown ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept="image/*"
              aria-label={shown ? 'Change photo' : 'Add photo'}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                // Shrink now: an unreadable file is reported before anything is saved, and the
                // preview is the small, right-way-up photo that will be uploaded.
                setPhotoError(null);
                setPhotoBusy(true);
                shrinkPhoto(file)
                  .then((blob) =>
                    setPhoto({ kind: 'set', blob, preview: URL.createObjectURL(blob) }),
                  )
                  .catch((error: unknown) =>
                    setPhotoError(error instanceof Error ? error.message : String(error)),
                  )
                  .finally(() => setPhotoBusy(false));
              }}
            />
          </label>
          {shown && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setPhoto({ kind: 'remove' })}
            >
              Remove photo
            </button>
          )}
          <p className="text-xs text-muted">
            Shown to customers on the QR menu. Square photos look best.
          </p>
          {photoError && (
            <p role="alert" className="text-sm text-red-700">
              {photoError}
            </p>
          )}
        </div>
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Sizes and prices</legend>
        <p className="text-xs text-subtle">
          Leave parcel price empty to use the dine-in price. Packaging is added to parcel orders
          only.
        </p>
        {variants.map((row, index) => {
          const n = index + 1;
          return (
            <div
              key={row.key}
              className="grid gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
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
        <button type="submit" className={primaryButton} disabled={save.isPending || photoBusy}>
          Save item
        </button>
        <button type="button" className={secondaryButton} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
