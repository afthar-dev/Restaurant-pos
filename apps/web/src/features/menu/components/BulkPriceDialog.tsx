import {
  applyPriceChange,
  bulkPriceSchema,
  MAX_PRICE_PAISE,
  parseRupees,
  type PriceChange,
} from '@rpos/shared';
import { useId, useState } from 'react';
import { useNotify } from '@/features/notifications';
import { rupees } from '@/shared/lib/money';
import { Button, describeError, Dialog, ErrorNote, Field, Input, Select } from '@/shared/ui';
import { filterMenu } from '../menuOrder';
import { useBulkPrices } from '../mutations';
import type { MenuCategory } from '../types';

type Scope = 'all' | 'category' | 'pick';
type Mode = 'up-percent' | 'down-percent' | 'up-rupees' | 'down-rupees';

const MODES: { value: Mode; label: string }[] = [
  { value: 'up-percent', label: 'Increase by %' },
  { value: 'down-percent', label: 'Decrease by %' },
  { value: 'up-rupees', label: 'Increase by ₹' },
  { value: 'down-rupees', label: 'Decrease by ₹' },
];

/** "5" or "2.5" in the box, as a signed change; null while it is not a usable number. */
function toChange(mode: Mode, amount: string): PriceChange | null {
  // parseRupees reads two decimals: 5 → 500, which is 5% in basis points or ₹5 in paise.
  const hundredths = parseRupees(amount.trim());
  if (hundredths === null || hundredths === 0) return null;
  const sign = mode.startsWith('down') ? -1 : 1;
  return mode.endsWith('percent')
    ? { kind: 'percent', basisPoints: sign * hundredths }
    : { kind: 'amount', paise: sign * hundredths };
}

/** Raise or lower many prices at once, with every old → new price shown before saving. */
export function BulkPriceDialog({
  categories,
  onClose,
}: {
  categories: MenuCategory[];
  onClose: () => void;
}) {
  const id = useId();
  const notify = useNotify();
  const [scope, setScope] = useState<Scope>('all');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [picked, setPicked] = useState<string[]>([]);
  const [find, setFind] = useState('');
  const [mode, setMode] = useState<Mode>('up-percent');
  const [amount, setAmount] = useState('');
  const [roundTo, setRoundTo] = useState<100 | 500 | 1000>(100);
  const save = useBulkPrices(({ updated }) => {
    notify({
      text: `Prices updated for ${updated} ${updated === 1 ? 'size' : 'sizes'}`,
      tone: 'success',
    });
    onClose();
  });

  const allItems = categories.flatMap((c) => c.items);
  const items =
    scope === 'all'
      ? allItems
      : scope === 'category'
        ? (categories.find((c) => c.id === categoryId)?.items ?? [])
        : allItems.filter((i) => picked.includes(i.id));
  const change = toChange(mode, amount);

  // A menu is a few hundred sizes at most: worked out on each render.
  const rows = (
    change
      ? items.flatMap((item) =>
          item.variants.map((v) => ({
            key: v.id,
            label: `${item.name} ${v.name}`,
            dineIn: [v.dineInPrice, applyPriceChange(v.dineInPrice, change, roundTo)] as const,
            parcel: [v.parcelPrice, applyPriceChange(v.parcelPrice, change, roundTo)] as const,
          })),
        )
      : []
  ).filter((r) => r.dineIn[0] !== r.dineIn[1] || r.parcel[0] !== r.parcel[1]);
  const below = rows.some((r) => r.dineIn[1] < 0 || r.parcel[1] < 0);
  const above = rows.some((r) => r.dineIn[1] > MAX_PRICE_PAISE || r.parcel[1] > MAX_PRICE_PAISE);
  const count = rows.length;
  const itemIds = [...new Set(items.map((i) => i.id))];
  // The server's own limits, said here before anyone presses Update.
  const check = change ? bulkPriceSchema.safeParse({ itemIds, change, roundTo }) : null;
  const limit = check && !check.success && count > 0 ? check.error.issues[0]?.message : null;

  return (
    <Dialog label="Change prices" onClose={onClose} wide>
      <h2 className="text-lg font-semibold">Change prices</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Which dishes</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ['all', 'All dishes'],
              ['category', 'One category'],
              ['pick', 'Pick dishes'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={scope === value}
                onChange={() => setScope(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {scope === 'category' && (
          <Field id={`${id}-category`} label="Category">
            <Select
              id={`${id}-category`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {scope === 'pick' && (
          <div className="flex flex-col gap-2">
            <Field id={`${id}-find`} label="Find a dish">
              <Input
                id={`${id}-find`}
                type="search"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
            </Field>
            {/* Names are unique only within a category, so each row also names its category. */}
            <ul className="max-h-56 overflow-y-auto rounded-md border border-border p-2 text-sm">
              {filterMenu(categories, find).flatMap((c) =>
                c.items.map((item) => (
                  <li key={item.id}>
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={picked.includes(item.id)}
                        onChange={(e) =>
                          setPicked((ids) =>
                            e.target.checked ? [...ids, item.id] : ids.filter((x) => x !== item.id),
                          )
                        }
                      />
                      {item.name}
                      <span className="text-xs text-subtle"> {c.name}</span>
                    </label>
                  </li>
                )),
              )}
            </ul>
            {picked.length > 0 && <p className="text-xs text-muted">{`${picked.length} picked`}</p>}
          </div>
        )}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={`${id}-mode`} label="Change">
          <Select id={`${id}-mode`} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-amount`} label="By how much">
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field id={`${id}-round`} label="Round to">
          <Select
            id={`${id}-round`}
            value={roundTo}
            onChange={(e) => setRoundTo(Number(e.target.value) as 100 | 500 | 1000)}
          >
            <option value={100}>₹1</option>
            <option value={500}>₹5</option>
            <option value={1000}>₹10</option>
          </Select>
        </Field>
      </div>
      {change && (
        <>
          <p className="text-sm font-medium">{`${count} ${count === 1 ? 'price will' : 'prices will'} change`}</p>
          {count > 0 && (
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <table aria-label="New prices" className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Dish
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Dine-in
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Parcel
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr
                      key={r.key}
                      className={r.dineIn[1] < 0 || r.parcel[1] < 0 ? 'bg-red-50' : ''}
                    >
                      <th scope="row" className="px-3 py-2 font-medium">
                        {r.label}
                      </th>
                      <td className="px-3 py-2 tabular-nums">{`${rupees(r.dineIn[0])} → ${rupees(r.dineIn[1])}`}</td>
                      <td className="px-3 py-2 tabular-nums">{`${rupees(r.parcel[0])} → ${rupees(r.parcel[1])}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {below && (
        <p role="alert" className="text-sm text-red-700">
          Some prices would go below ₹0. Choose a smaller decrease.
        </p>
      )}
      {above && (
        <p role="alert" className="text-sm text-red-700">
          Some prices would go above the highest price allowed.
        </p>
      )}
      {limit && !below && !above && (
        <p role="alert" className="text-sm text-red-700">
          {limit}
        </p>
      )}
      <ErrorNote message={save.isError ? describeError(save.error) : null} />
      <div className="flex flex-wrap gap-2">
        <Button
          loading={save.isPending}
          disabled={!change || count === 0 || below || above || Boolean(limit)}
          onClick={() => change && save.mutate({ itemIds, change, roundTo })}
        >
          {`Update ${count} ${count === 1 ? 'price' : 'prices'}`}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
