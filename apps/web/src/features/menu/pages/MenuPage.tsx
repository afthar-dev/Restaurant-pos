import { categorySchema } from '@rpos/shared';
import { ArrowUpDown, Check, Percent, Plus, Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Button,
  ConfirmBar,
  describeError,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  inputClass,
  PageHeader,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import { BulkPriceDialog } from '../components/BulkPriceDialog';
import { ItemEditor } from '../components/ItemEditor';
import { ItemRow } from '../components/ItemRow';
import { SortableList } from '../components/SortableList';
import { filterMenu } from '../menuOrder';
import { type Station, useStations } from '@/features/kitchen-setup';
import { useTaxRates } from '@/features/tax';
import {
  useAddCategory,
  useArchiveMenuEntry,
  useReorder,
  useUpdateCategory,
  type MenuEntry,
} from '../mutations';
import { useAddonGroups, useMenu } from '../queries';
import type { MenuCategory, MenuItem } from '../types';

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
        <Plus aria-hidden="true" />
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
  const [query, setQuery] = useState('');
  const [copying, setCopying] = useState<MenuItem | null>(null);
  const [bulk, setBulk] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const reorder = useReorder((error) => setReorderError(describeError(error)));

  const archive = useArchiveMenuEntry(() => setPending(null));

  const categories = menu.data?.categories ?? [];
  const selected = categories.find((c) => c.id === selectedId) ?? categories[0];
  const ready = menu.data && taxRates.data && stations.data && groups.data;
  const pendingName = pending
    ? pending.kind === 'item'
      ? pending.item.name
      : pending.category.name
    : '';
  const results = filterMenu(categories, query);
  const matchCount = results.reduce((n, c) => n + c.items.length, 0);
  const searching = query.trim() !== '';
  // Moving rows only makes sense in the full list, not in search results.
  const sorting = reordering && !searching;

  const startEditing = (next: MenuItem | 'new' | null, copyOf: MenuItem | null = null) => {
    setCopying(copyOf);
    setEditing(next);
  };
  const duplicate = (item: MenuItem) => {
    setSelectedId(item.categoryId);
    setEditingCategory(false);
    startEditing('new', item);
  };
  const itemActions = (item: MenuItem) => (
    <>
      <button type="button" className={secondaryButton} onClick={() => startEditing(item)}>
        Edit
      </button>
      <button
        type="button"
        className={secondaryButton}
        aria-label={`Duplicate ${item.name}`}
        onClick={() => duplicate(item)}
      >
        Duplicate
      </button>
      <button
        type="button"
        className={secondaryButton}
        onClick={() => setPending({ kind: 'item', item })}
      >
        Archive
      </button>
    </>
  );

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        as="h2"
        title="Menu"
        description="Categories send their kitchen tickets to a station. Dishes have sizes with dine-in and parcel prices."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Percent aria-hidden="true" />}
              disabled={!menu.data}
              onClick={() => setBulk(true)}
            >
              Change prices
            </Button>
            <Button
              variant={reordering ? 'primary' : 'secondary'}
              icon={reordering ? <Check aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}
              disabled={!menu.data}
              onClick={() => {
                setReorderError(null);
                startEditing(null);
                setReordering((r) => !r);
              }}
            >
              {reordering ? 'Done' : 'Reorder'}
            </Button>
          </>
        }
      />
      {reordering && (
        <p className="text-sm text-muted">
          Drag the handles, or use the arrows. The POS, captain app and QR menu show this order.
        </p>
      )}
      <ErrorNote message={reorderError} />
      {bulk && menu.data && (
        <BulkPriceDialog categories={categories} onClose={() => setBulk(false)} />
      )}
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

      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
        />
        <Input
          type="search"
          aria-label="Search dishes"
          placeholder="Search dishes"
          className="pr-12 pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <IconButton
            label="Clear"
            size="sm"
            variant="ghost"
            icon={<X />}
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => setQuery('')}
          />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-4">
          {sorting ? (
            <SortableList
              label="Category order"
              items={categories}
              onMove={(ids) => {
                setReorderError(null);
                reorder.mutate({ kind: 'categories', ids });
              }}
              render={(c) => (
                <button
                  type="button"
                  className={`min-h-11 w-full text-left text-sm ${
                    selected?.id === c.id ? 'font-semibold text-primary-900' : 'font-medium'
                  }`}
                  onClick={() => setSelectedId(c.id)}
                >
                  {c.name}
                </button>
              )}
            />
          ) : (
            <nav aria-label="Categories" className="flex flex-col gap-1">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSelectedId(c.id);
                    startEditing(null);
                    setEditingCategory(false);
                  }}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                    !searching && selected?.id === c.id
                      ? 'bg-primary-50 font-semibold text-primary-900'
                      : 'hover:bg-surface-2'
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-subtle">{c.items.length}</span>
                </button>
              ))}
            </nav>
          )}
          {!sorting && stations.data && <AddCategoryForm stations={stations.data} />}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {editing && ready && selected && (
            <ItemEditor
              key={editing === 'new' ? `new-${copying?.id ?? ''}` : editing.id}
              existing={editing === 'new' ? null : editing}
              copyFrom={editing === 'new' ? copying : null}
              categories={categories}
              defaultCategoryId={selected.id}
              taxRates={taxRates.data}
              addonGroups={groups.data}
              onDone={() => startEditing(null)}
            />
          )}

          {searching ? (
            results.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title={`No dishes match "${query.trim()}"`}
                description="Check the spelling, or search for part of the name."
                action={
                  <button type="button" className={secondaryButton} onClick={() => setQuery('')}>
                    Clear search
                  </button>
                }
              />
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted">
                  {`${matchCount} ${matchCount === 1 ? 'dish matches' : 'dishes match'} "${query.trim()}"`}
                </p>
                {results.map((c) => (
                  <section key={c.id} aria-label={c.name} className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-muted">{c.name}</h3>
                    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                      {c.items.map((item) => (
                        <li key={item.id} className="px-4 py-3">
                          <ItemRow item={item} actions={itemActions(item)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )
          ) : selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <span className="text-xs text-subtle">KOTs go to {selected.station.name}</span>
                </div>
                <div className={sorting ? 'hidden' : 'flex gap-2'}>
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
                    onClick={() => startEditing('new')}
                  >
                    <Plus aria-hidden="true" />
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

              {sorting ? (
                <SortableList
                  label={`Dishes in ${selected.name}`}
                  items={selected.items}
                  onMove={(ids) => {
                    setReorderError(null);
                    reorder.mutate({ kind: 'items', categoryId: selected.id, ids });
                  }}
                  render={(item) => <ItemRow item={item} actions={null} />}
                />
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                  {selected.items.map((item) => (
                    <li key={item.id} className="px-4 py-3">
                      <ItemRow item={item} actions={itemActions(item)} />
                    </li>
                  ))}
                  {selected.items.length === 0 && (
                    <li className="px-4 py-3 text-sm text-subtle">
                      No items in this category yet.
                    </li>
                  )}
                </ul>
              )}
            </>
          ) : (
            menu.data && <p className="text-muted">Add your first category to start the menu.</p>
          )}
        </div>
      </div>
    </section>
  );
}
