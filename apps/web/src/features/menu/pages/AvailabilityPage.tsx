import { useState } from 'react';
import {
  describeError,
  ErrorNote,
  FoodMark,
  inputClass,
  LoadingScreen,
  PageHeader,
} from '@/shared/ui';
import { useToggleAddon, useToggleItem } from '../mutations';
import { useMenu } from '../queries';
import { type MenuAddon } from '../types';

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-success-solid' : 'bg-slate-300'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/** Staff mark dishes out of stock so waiters and the QR menu stop offering them. */
export function AvailabilityPage() {
  const menu = useMenu();
  const [search, setSearch] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const handlers = {
    onStart: () => setFailure(null),
    onFailed: (name: string) => setFailure(`Could not update ${name}. Try again.`),
  };
  const toggle = useToggleItem(handlers);
  const toggleAddon = useToggleAddon(handlers);

  const query = search.trim().toLowerCase();
  // An add-on group is shared by many items: list each option once.
  const addonGroups = new Map<string, { name: string; addons: Map<string, MenuAddon> }>();
  for (const c of menu.data?.categories ?? []) {
    for (const i of c.items) {
      for (const g of i.addonGroups) {
        const entry = addonGroups.get(g.id) ?? { name: g.name, addons: new Map() };
        for (const a of g.addons) {
          if (a.name.toLowerCase().includes(query)) entry.addons.set(a.id, a);
        }
        addonGroups.set(g.id, entry);
      }
    }
  }
  const addonSections = [...addonGroups.entries()].filter(([, g]) => g.addons.size > 0);
  const categories = (menu.data?.categories ?? [])
    .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(query)) }))
    .filter((c) => c.items.length > 0);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Item availability"
        description="Switch off a dish when the kitchen runs out of it. It disappears from the POS, captain app and QR menu until switched back on."
      />
      <label htmlFor="availability-search" className="sr-only">
        Search items
      </label>
      <input
        id="availability-search"
        aria-label="Search items"
        className={inputClass}
        placeholder="Search items"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorNote message={failure} />
      <ErrorNote message={menu.isError ? describeError(menu.error) : null} />
      {menu.isPending && <LoadingScreen />}
      {categories.map((c) => (
        <section key={c.id} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">{c.name}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {c.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-2">
                  <FoodMark type={item.foodType} />
                  <span className={item.isAvailable ? '' : 'text-subtle line-through'}>
                    {item.name}
                  </span>
                </span>
                <Switch
                  on={item.isAvailable}
                  label={`${item.name} available`}
                  onToggle={() => toggle.mutate(item)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {addonSections.map(([id, group]) => (
        <section key={id} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            Add-ons: {group.name}
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {[...group.addons.values()].map((addon) => (
              <li key={addon.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className={addon.isAvailable ? '' : 'text-subtle line-through'}>
                  {addon.name}
                </span>
                <Switch
                  on={addon.isAvailable}
                  label={`${addon.name} available`}
                  onToggle={() => toggleAddon.mutate(addon)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {menu.data && categories.length === 0 && addonSections.length === 0 && (
        <p className="text-subtle">No items match.</p>
      )}
    </section>
  );
}
