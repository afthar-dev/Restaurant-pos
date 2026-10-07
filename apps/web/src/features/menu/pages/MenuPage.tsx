import { rupees } from '@/shared/lib/money';
import { categorySchema } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  PageHeader,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import { ItemEditor } from '../components/ItemEditor';
import { type Station, useStations } from '@/features/kitchen-setup';
import { useTaxRates } from '@/features/tax';
import {
  useAddCategory,
  useArchiveMenuEntry,
  useUpdateCategory,
  type MenuEntry,
} from '../mutations';
import { useAddonGroups, useMenu } from '../queries';
import { FOOD_DOT, FOOD_LABEL, type MenuCategory, type MenuItem } from '../types';

function AddCategoryForm({ stations }: { stations: Station[] }) {
  const [name, setName] = useState('');
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [error, setError] = useState<string | undefined>();
  const add = useAddCategory(() => setName(''));
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = categorySchema.safeParse({ name: name.trim(), stationId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    add.mutate(parsed.data);
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <Field id="category-name" label="New category" error={error}>
        <input
          id="category-name"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id="category-station" label="Sends KOTs to">
        <select
          id="category-station"
          className={inputClass}
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
        >
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className={secondaryButton} disabled={add.isPending}>
        Add category
      </button>
      <ErrorNote message={add.isError ? describeError(add.error) : null} />
    </form>
  );
}

function EditCategoryForm({
  category,
  stations,
  onDone,
}: {
  category: MenuCategory;
  stations: Station[];
  onDone: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [stationId, setStationId] = useState(category.station.id);
  const [error, setError] = useState<string | undefined>();
  const save = useUpdateCategory(category, onDone);
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = categorySchema.safeParse({
      name: name.trim(),
      stationId,
      sortOrder: category.sortOrder,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    save.mutate(parsed.data);
  }
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <Field id="edit-category-name" label="Category name" error={error}>
        <input
          id="edit-category-name"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id="edit-category-station" label="KOTs go to">
        <select
          id="edit-category-station"
          className={inputClass}
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
        >
          {stations.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className={primaryButton} disabled={save.isPending}>
        Save category
      </button>
      <button type="button" className={secondaryButton} onClick={onDone}>
        Cancel
      </button>
      <ErrorNote message={save.isError ? describeError(save.error) : null} />
    </form>
  );
}

type Pending = MenuEntry;

export function MenuPage() {
  const menu = useMenu();
  const taxRates = useTaxRates();
  const stations = useStations();
  const groups = useAddonGroups();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editingCategory, setEditingCategory] = useState(false);

  const archive = useArchiveMenuEntry(() => setPending(null));

  const categories = menu.data?.categories ?? [];
  const selected = categories.find((c) => c.id === selectedId) ?? categories[0];
  const ready = menu.data && taxRates.data && stations.data && groups.data;
  const pendingName = pending
    ? pending.kind === 'item'
      ? pending.item.name
      : pending.category.name
    : '';

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        as="h2"
        title="Menu"
        description="Categories send their kitchen tickets to a station. Dishes have sizes with dine-in and parcel prices."
      />
      <ErrorNote message={menu.isError ? describeError(menu.error) : null} />
      {pending && (
        <ConfirmBar
          question={`Archive ${pendingName}? It disappears from the POS and QR menu.`}
          confirmLabel={`Yes, archive ${pendingName}`}
          onConfirm={() => archive.mutate(pending)}
          onCancel={() => setPending(null)}
          busy={archive.isPending}
        />
      )}
      <ErrorNote message={archive.isError ? describeError(archive.error) : null} />

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-4">
          <nav aria-label="Categories" className="flex flex-col gap-1">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedId(c.id);
                  setEditing(null);
                  setEditingCategory(false);
                }}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                  selected?.id === c.id
                    ? 'bg-primary-50 font-semibold text-primary-900'
                    : 'hover:bg-surface-2'
                }`}
              >
                <span>{c.name}</span>
                <span className="text-xs text-subtle">{c.items.length}</span>
              </button>
            ))}
          </nav>
          {stations.data && <AddCategoryForm stations={stations.data} />}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <span className="text-xs text-subtle">KOTs go to {selected.station.name}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setEditingCategory(true)}
                  >
                    Edit category
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setPending({ kind: 'category', category: selected })}
                  >
                    Archive category
                  </button>
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={!ready}
                    onClick={() => setEditing('new')}
                  >
                    Add item
                  </button>
                </div>
              </div>

              {editingCategory && stations.data && (
                <EditCategoryForm
                  key={selected.id}
                  category={selected}
                  stations={stations.data}
                  onDone={() => setEditingCategory(false)}
                />
              )}

              {editing && ready && (
                <ItemEditor
                  key={editing === 'new' ? 'new' : editing.id}
                  existing={editing === 'new' ? null : editing}
                  categories={categories}
                  defaultCategoryId={selected.id}
                  taxRates={taxRates.data}
                  addonGroups={groups.data}
                  onDone={() => setEditing(null)}
                />
              )}

              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {selected.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          aria-label={FOOD_LABEL[item.foodType]}
                          className={`inline-block h-2.5 w-2.5 rounded-full ${FOOD_DOT[item.foodType]}`}
                        />
                        {item.name}
                        {item.isCombo && <span className="text-xs text-subtle">combo</span>}
                        {!item.isAvailable && (
                          <span className="rounded bg-amber-50 px-1.5 text-xs text-amber-800">
                            out of stock
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-muted">
                        {item.variants.map((v) => `${v.name} ${rupees(v.dineInPrice)}`).join(' · ')}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => setEditing(item)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => setPending({ kind: 'item', item })}
                      >
                        Archive
                      </button>
                    </div>
                  </li>
                ))}
                {selected.items.length === 0 && (
                  <li className="px-4 py-3 text-sm text-subtle">No items in this category yet.</li>
                )}
              </ul>
            </>
          ) : (
            menu.data && <p className="text-muted">Add your first category to start the menu.</p>
          )}
        </div>
      </div>
    </section>
  );
}
