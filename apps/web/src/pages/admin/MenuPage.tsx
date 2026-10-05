import { categorySchema } from '@rpos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../../auth/api';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '../../components/ui';
import { ItemEditor } from './ItemEditor';
import { stationsKey, type Station } from './KitchenPage';
import {
  addonGroupsKey,
  FOOD_DOT,
  FOOD_LABEL,
  menuKey,
  rupees,
  type Menu,
  type MenuAddonGroup,
  type MenuCategory,
  type MenuItem,
} from './menu-types';
import { taxRatesKey, type TaxRate } from './TaxPage';

function AddCategoryForm({ stations }: { stations: Station[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [error, setError] = useState<string | undefined>();
  const add = useMutation({
    mutationFn: (body: object) => apiFetch('/api/menu/categories', { method: 'POST', body }),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: menuKey });
    },
  });
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

type Pending = { kind: 'item'; item: MenuItem } | { kind: 'category'; category: MenuCategory };

export function MenuPage() {
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: menuKey, queryFn: () => apiFetch<Menu>('/api/menu') });
  const taxRates = useQuery({
    queryKey: taxRatesKey,
    queryFn: () => apiFetch<TaxRate[]>('/api/tax-rates'),
  });
  const stations = useQuery({
    queryKey: stationsKey,
    queryFn: () => apiFetch<Station[]>('/api/stations'),
  });
  const groups = useQuery({
    queryKey: addonGroupsKey,
    queryFn: () => apiFetch<MenuAddonGroup[]>('/api/menu/addon-groups'),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const archive = useMutation({
    mutationFn: (p: Pending) =>
      p.kind === 'item'
        ? apiFetch(`/api/menu/items/${p.item.id}/archive`, { method: 'POST' })
        : apiFetch(`/api/menu/categories/${p.category.id}/archive`, { method: 'POST' }),
    onSuccess: async () => {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: menuKey });
    },
  });

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
      <h2 className="text-xl font-semibold">Menu</h2>
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
                }}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                  selected?.id === c.id
                    ? 'bg-emerald-50 font-semibold text-emerald-900'
                    : 'hover:bg-slate-100'
                }`}
              >
                <span>{c.name}</span>
                <span className="text-xs text-slate-500">{c.items.length}</span>
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
                  <span className="text-xs text-slate-500">KOTs go to {selected.station.name}</span>
                </div>
                <div className="flex gap-2">
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

              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
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
                        {item.isCombo && <span className="text-xs text-slate-500">combo</span>}
                        {!item.isAvailable && (
                          <span className="rounded bg-amber-50 px-1.5 text-xs text-amber-800">
                            out of stock
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-slate-600">
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
                  <li className="px-4 py-3 text-sm text-slate-500">
                    No items in this category yet.
                  </li>
                )}
              </ul>
            </>
          ) : (
            menu.data && (
              <p className="text-slate-600">Add your first category to start the menu.</p>
            )
          )}
        </div>
      </div>
    </section>
  );
}
