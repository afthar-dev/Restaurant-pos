import { BookOpen, Minus, Plus, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MAX_QUANTITY, useCart, type CartLine } from '@/features/cart';
import { rupees } from '@/shared/lib/money';
import { FOOD_LABEL, FoodMark, Sheet } from '@/shared/ui';
import type { Menu as MenuData, MenuItem } from '../types';

const fromPrice = (item: MenuItem) => {
  const lowest = Math.min(...item.variants.map((v) => v.price));
  return item.variants.length > 1 ? `from ${rupees(lowest)}` : rupees(lowest);
};

/** A dish with one size and no extras goes straight into the cart from its row. */
const isPlain = (item: MenuItem) => item.variants.length === 1 && item.addonGroups.length === 0;

/** The cart line a plain dish makes (same key the dish sheet would make with no choices). */
function plainLine(item: MenuItem): CartLine {
  const variant = item.variants[0]!;
  return {
    key: `${variant.id}||`,
    variantId: variant.id,
    addonIds: [],
    quantity: 1,
    label: variant.name === 'Regular' ? item.name : `${item.name} (${variant.name})`,
    unitPrice: variant.price,
  };
}

const sectionId = (categoryId: string) => `menu-${categoryId}`;

/** ADD, or a counter once the dish is in the cart. */
function AddControl({
  item,
  onPick,
  onOpenCart,
}: {
  item: MenuItem;
  onPick: (item: MenuItem) => void;
  onOpenCart: () => void;
}) {
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const setQuantity = useCart((s) => s.setQuantity);
  const variantIds = new Set(item.variants.map((v) => v.id));
  const mine = lines.filter((l) => variantIds.has(l.variantId));
  const count = mine.reduce((n, l) => n + l.quantity, 0);
  const plain = isPlain(item);
  // ADD and the counter replace each other; keep keyboard focus on whichever is now shown.
  const keepFocus = useRef(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const empty = count === 0;
  useEffect(() => {
    if (!keepFocus.current) return;
    keepFocus.current = false;
    (empty ? addRef : moreRef).current?.focus();
  }, [empty]);
  const willSwap = () => {
    keepFocus.current = true;
  };

  const box =
    'flex h-11 w-28 items-center justify-center rounded-lg border border-primary-300 bg-surface text-primary-800 shadow-card';
  if (empty) {
    return (
      <button
        ref={addRef}
        type="button"
        aria-label={`Add ${item.name}`}
        className={`${box} text-sm font-bold tracking-wide`}
        onClick={() => {
          if (plain) {
            willSwap();
            add(plainLine(item));
          } else onPick(item);
        }}
      >
        ADD
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label={`${item.name}, ${count} in order`}
      className={`${box} justify-between overflow-hidden`}
    >
      <button
        type="button"
        aria-label={`One less ${item.name}`}
        className="flex h-full w-11 items-center justify-center"
        onClick={() => {
          // With several different choices in the cart, the order page says which to change.
          if (mine.length !== 1) return onOpenCart();
          if (count === 1) willSwap();
          setQuantity(mine[0]!.key, mine[0]!.quantity - 1);
        }}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <span className="text-sm font-bold tabular-nums">{count}</span>
      <button
        ref={moreRef}
        type="button"
        aria-label={`One more ${item.name}`}
        className="flex h-full w-11 items-center justify-center disabled:opacity-40"
        disabled={plain && count >= MAX_QUANTITY}
        onClick={() => (plain ? add(plainLine(item)) : onPick(item))}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

function DishRow({
  item,
  onPick,
  onOpenCart,
}: {
  item: MenuItem;
  onPick: (item: MenuItem) => void;
  onOpenCart: () => void;
}) {
  return (
    <li className="flex gap-4 py-5">
      <button
        type="button"
        aria-label={`${item.name}, ${FOOD_LABEL[item.foodType]}, ${fromPrice(item)}`}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
        onClick={() => onPick(item)}
      >
        <FoodMark type={item.foodType} />
        <span className="text-base font-semibold leading-snug">{item.name}</span>
        <span className="text-[15px] font-medium text-primary-800 tabular-nums">
          {fromPrice(item)}
        </span>
        {item.description && (
          <span className="line-clamp-2 text-sm text-muted">{item.description}</span>
        )}
      </button>
      <div className="flex w-28 shrink-0 flex-col items-center">
        {item.imageUrl ? (
          <div className="relative mb-3">
            <img
              src={item.imageUrl}
              alt=""
              width={112}
              height={112}
              loading="lazy"
              decoding="async"
              className="size-28 rounded-xl object-cover"
            />
            <div className="absolute inset-x-0 -bottom-4 flex justify-center">
              <AddControl item={item} onPick={onPick} onOpenCart={onOpenCart} />
            </div>
          </div>
        ) : (
          <div className="pt-6">
            <AddControl item={item} onPick={onPick} onOpenCart={onOpenCart} />
          </div>
        )}
        {!isPlain(item) && <span className="mt-2 text-xs text-muted">Customisable</span>}
      </div>
    </li>
  );
}

/**
 * The whole menu in one scroll: search, Veg only, a section per category, and a Menu button
 * list that jumps to a category, as diners know from food-delivery apps.
 */
export function Menu({
  menu,
  onPick,
  onOpenCart,
}: {
  menu: MenuData;
  onPick: (item: MenuItem) => void;
  onOpenCart: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const [jumping, setJumping] = useState(false);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.categories
      .map((c) => ({
        ...c,
        items: c.items.filter(
          (i) => (!vegOnly || i.foodType === 'VEG') && (!q || i.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [menu, query, vegOnly]);

  if (menu.categories.length === 0) {
    return <p className="text-muted">Nothing can be ordered right now.</p>;
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-bg/95 px-4 pt-2 pb-3 backdrop-blur">
        <label className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            aria-label="Search dishes"
            placeholder="Search for dishes"
            className="min-h-12 w-full rounded-xl border border-border-strong bg-surface pr-10 pl-10 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center text-muted"
              onClick={() => setQuery('')}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
        </label>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={vegOnly}
            aria-label="Veg only"
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium ${
              vegOnly
                ? 'border-green-700 bg-green-50 text-green-900'
                : 'border-border-strong bg-surface'
            }`}
            onClick={() => setVegOnly((v) => !v)}
          >
            <FoodMark type="VEG" />
            Veg only
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold"
            onClick={() => setJumping(true)}
          >
            <BookOpen aria-hidden="true" className="size-4" />
            Menu
          </button>
        </div>
      </div>

      {sections.length === 0 && (
        <p className="py-10 text-center text-muted">
          {query.trim() ? `No dishes match "${query.trim()}"` : 'No veg dishes right now.'}
        </p>
      )}

      {sections.map((c) => (
        <section
          key={c.id}
          id={sectionId(c.id)}
          aria-labelledby={`${id}-${c.id}`}
          className="scroll-mt-32 border-t-8 border-surface-2 pt-4 first:border-t-0"
        >
          <h2 id={`${id}-${c.id}`} tabIndex={-1} className="text-lg font-bold outline-none">
            {c.name}
            <span className="ml-2 text-sm font-normal text-muted">{`${c.items.length}`}</span>
          </h2>
          <ul className="divide-y divide-border">
            {c.items.map((item) => (
              <DishRow key={item.id} item={item} onPick={onPick} onOpenCart={onOpenCart} />
            ))}
          </ul>
        </section>
      ))}

      {jumping && (
        <Sheet label="Menu" onClose={() => setJumping(false)}>
          <h2 className="text-lg font-bold">Menu</h2>
          <ul className="flex flex-col">
            {menu.categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex min-h-12 w-full items-center justify-between text-left text-base"
                  onClick={() => {
                    setJumping(false);
                    // Clear filters so the chosen section is on the page to scroll to.
                    setQuery('');
                    setVegOnly(false);
                    requestAnimationFrame(() => {
                      document
                        .getElementById(sectionId(c.id))
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      // Keyboard and screen-reader users land on the section they chose.
                      document.getElementById(`${id}-${c.id}`)?.focus({ preventScroll: true });
                    });
                  }}
                >
                  <span>{c.name}</span>
                  <span className="text-sm text-muted tabular-nums">{c.items.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
