# U5 Phase 2: Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One consistent SVG icon system across the staff and QR apps: fixed icon sizes, icons on key actions, payment modes, order types and empty lists, and FSSAI-style veg / non-veg / egg marks in place of coloured dots.

**Architecture:** `lucide-react` in both apps. Each app gets `shared/ui/Icon.tsx` (three sizes, decorative by default) and `shared/ui/FoodMark.tsx` (inline SVG, colours from new `--color-veg|nonveg|egg` tokens). The staff app also gets `shared/ui/PaymentIcon.tsx`, because billing, day close, expenses and reports all show payment modes and `shared/` is the only place every feature may import from.

**Tech Stack:** React 19, lucide-react 1.52 (web; add the same version to qr), Tailwind 4 tokens, Vitest + Testing Library + vitest-axe.

**Spec:** `docs/superpowers/specs/2026-10-08-u5-ui-polish-design.md` (Phase 2).

## Global Constraints

- One icon set: `lucide-react`, default stroke 2; no other icon library, no emoji or text glyphs (`−`, `+`, `×`) as icons.
- Icon sizes only: sm 16 px (`size-4`, inline with text), md 20 px (`size-5`, buttons/nav/list rows), lg 24 px (`size-6`, empty states/headers). Button icons keep the kit's `[&_svg]:size-4`.
- An icon next to visible text is `aria-hidden`; an icon that carries meaning alone has `role="img"` and an `aria-label` (or the control has one).
- Food marks: VEG green square + filled circle, NON_VEG brown square + filled triangle, EGG amber square + filled circle; `role="img"` with label "Veg" / "Non-veg" / "Egg". Colours from tokens, not hex in components.
- Touch targets stay ≥ 44 px (`min-h-11` / `size-11`) on POS, captain and QR.
- No em dashes in UI copy. Existing button labels and accessible names stay the same (icons are additions), so existing tests keep passing.
- First bundle within budget (≤ 260 kB gzip entry chunk); QR bundle grows by icons only (tree-shaken).
- Lint, typecheck and all web + qr tests pass.

## Review Focus

- **Food mark contrast:** each mark's colour against white and against `surface-2` is at least 3:1 (graphical object).
- **Screen readers on the QR menu:** today the QR food dot has no label at all; after this phase every dish row announces its food type once (not twice).
- **Icon-only steppers** in the QR cart and item sheet keep accessible names ("One less" / "One more" or the existing names) and 44 px targets.
- **Settle keys:** the C/U/K key hints on the settle panel still render and still work after icons are added to the mode buttons.
- **Kitchen display (dark theme):** icons inherit `currentColor`, so they stay visible on the dark KDS.

Tests for these are in Tasks 1, 2, 3 and 6; the dark-theme check is in Task 7's browser pass.

## File map

| File | Change |
| --- | --- |
| `apps/web/src/app/index.css` | `--color-veg`, `--color-nonveg`, `--color-egg` tokens |
| `apps/web/src/shared/ui/Icon.tsx` (+ test) | new |
| `apps/web/src/shared/ui/FoodMark.tsx` (+ test) | new |
| `apps/web/src/shared/ui/PaymentIcon.tsx` (+ test) | new |
| `apps/web/src/shared/ui/index.ts` | export the three |
| `apps/web/src/features/menu/types.ts`, `menu/index.ts` | drop `FOOD_DOT` |
| `apps/web/src/features/menu/components/ItemRow.tsx`, `menu/pages/AvailabilityPage.tsx`, `orders/components/MenuBrowser.tsx` | `FoodMark` |
| `apps/web/src/features/billing/components/SettlePanel.tsx`, `PaymentSheet.tsx`, `BillView.tsx` | payment icons |
| `apps/web/src/features/expenses/components/ExpenseForm.tsx`, `ExpenseList.tsx` | payment icons |
| `apps/web/src/features/day/pages/DayPage.tsx`, `reports/charts/PaymentDonut.tsx` | payment icons |
| `apps/web/src/features/orders/components/OrderPanel.tsx`, `ParcelList.tsx`, `qr/QrRequestCard.tsx`, `billing/components/BillActions.tsx`, `menu/pages/MenuPage.tsx` | action icons |
| `apps/web/src/features/menu/pages/AddonsPage.tsx`, `tax/pages/TaxPage.tsx`, `kitchen-setup/pages/KitchenPage.tsx` | `EmptyState` with icon |
| any file with a lucide icon sized `size-3`, `size-3.5`, `size-8`..`size-12` | snapped to sm/md/lg |
| `apps/qr/package.json`, `apps/qr/src/app/index.css` | lucide-react, food tokens |
| `apps/qr/src/shared/ui/Icon.tsx`, `FoodMark.tsx` (+ tests) | new |
| `apps/qr/src/features/menu/components/Menu.tsx`, `ItemSheet.tsx`, `cart/components/Cart.tsx`, `requests/components/Requests.tsx`, `app/Ordering.tsx` | icons |
| `apps/web/ARCHITECTURE.md` | icon rules |

---

### Task 1: Icon, FoodMark and PaymentIcon in the staff kit

**Files:**
- Modify: `apps/web/src/app/index.css`, `apps/web/src/shared/ui/index.ts`
- Create: `apps/web/src/shared/ui/Icon.tsx`, `FoodMark.tsx`, `PaymentIcon.tsx`, `icons.test.tsx`

**Interfaces:**
- Produces:
  - `Icon({ as: LucideIcon, size?: 'sm' | 'md' | 'lg', label?: string, className?: string })`: decorative (`aria-hidden`) unless `label` is given, then `role="img"` + `aria-label`.
  - `FoodMark({ type: 'VEG' | 'NON_VEG' | 'EGG', size?: 14 | 16, className?: string })`
  - `PaymentIcon({ mode: PaymentMode, size?: 'sm' | 'md' | 'lg', className?: string })` (decorative; mode names are always written beside it), plus `PAYMENT_ICON: Record<PaymentMode, LucideIcon>`.

- [ ] **Step 1: Write the failing test** `shared/ui/icons.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { Banknote } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { FoodMark } from './FoodMark';
import { Icon } from './Icon';
import { PaymentIcon } from './PaymentIcon';

describe('Icon', () => {
  it('is decorative by default and sized from three steps', () => {
    const { container } = render(<Icon as={Banknote} size="lg" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('size-6');
  });

  it('becomes an image with a name when labelled', () => {
    render(<Icon as={Banknote} label="Cash" />);
    expect(screen.getByRole('img', { name: 'Cash' })).toHaveClass('size-5');
  });
});

describe('FoodMark', () => {
  it('names each food type and draws its symbol', () => {
    render(
      <main>
        <FoodMark type="VEG" />
        <FoodMark type="NON_VEG" />
        <FoodMark type="EGG" />
      </main>,
    );
    const veg = screen.getByRole('img', { name: 'Veg' });
    const non = screen.getByRole('img', { name: 'Non-veg' });
    expect(screen.getByRole('img', { name: 'Egg' })).toBeInTheDocument();
    expect(veg.querySelector('circle')).not.toBeNull();
    expect(non.querySelector('path, polygon')).not.toBeNull();
    expect(veg).toHaveStyle({ color: 'var(--color-veg)' });
    expect(non).toHaveStyle({ color: 'var(--color-nonveg)' });
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <FoodMark type="VEG" />
      </main>,
    );
    await expectNoAxeViolations();
  });
});

describe('PaymentIcon', () => {
  it('draws a different icon for each mode, hidden from screen readers', () => {
    const { container } = render(
      <>
        <PaymentIcon mode="CASH" />
        <PaymentIcon mode="UPI" />
        <PaymentIcon mode="CARD" />
      </>,
    );
    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs).toHaveLength(3);
    expect(new Set(svgs.map((s) => s.getAttribute('class'))).size).toBe(3);
    for (const s of svgs) expect(s).toHaveAttribute('aria-hidden', 'true');
  });
});
```

(lucide adds a per-icon class such as `lucide-banknote`, so three different `class` strings prove three different icons.)

- [ ] **Step 2: Run, expect FAIL** (modules missing)

Run: `pnpm --filter @rpos/web exec vitest run src/shared/ui/icons.test.tsx`

- [ ] **Step 3: Implement**

`app/index.css`, in `@theme` after the `pay-*` colours:

```css
  /* Food marks (FSSAI style). Each is 3:1 or better on white and surface-2. */
  --color-veg: #15803d;
  --color-nonveg: #7c2d12;
  --color-egg: #b45309;
```

`shared/ui/Icon.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export type IconSize = 'sm' | 'md' | 'lg';

/** 16 px inline with text, 20 px in buttons and rows, 24 px in empty states and headers. */
export const ICON_SIZE: Record<IconSize, string> = { sm: 'size-4', md: 'size-5', lg: 'size-6' };

/** A lucide icon at one of the three kit sizes; decorative unless it has a label. */
export function Icon({
  as: Glyph,
  size = 'md',
  label,
  className,
}: {
  as: LucideIcon;
  size?: IconSize;
  label?: string;
  className?: string;
}) {
  return (
    <Glyph
      className={cn(ICON_SIZE[size], 'shrink-0', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
```

`shared/ui/FoodMark.tsx`:

```tsx
import type { FoodType } from '@rpos/shared';
import { cn } from '@/shared/lib/cn';

const MARK: Record<FoodType, { label: string; color: string }> = {
  VEG: { label: 'Veg', color: 'var(--color-veg)' },
  NON_VEG: { label: 'Non-veg', color: 'var(--color-nonveg)' },
  EGG: { label: 'Egg', color: 'var(--color-egg)' },
};

/**
 * The veg / non-veg / egg symbol Indian diners know from food packets: a square outline with
 * a filled circle (veg, egg) or triangle (non-veg).
 */
export function FoodMark({
  type,
  size = 14,
  className,
}: {
  type: FoodType;
  size?: 14 | 16;
  className?: string;
}) {
  const mark = MARK[type];
  return (
    <svg
      role="img"
      aria-label={mark.label}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      style={{ color: mark.color }}
    >
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {type === 'NON_VEG' ? (
        <path d="M8 4.25 L11.75 11 H4.25 Z" fill="currentColor" />
      ) : (
        <circle cx="8" cy="8" r="3.5" fill="currentColor" />
      )}
    </svg>
  );
}
```

If `FoodType` is not exported by `@rpos/shared`, use `'VEG' | 'NON_VEG' | 'EGG'` and ledger it.

`shared/ui/PaymentIcon.tsx`:

```tsx
import type { PaymentMode } from '@rpos/shared';
import { Banknote, CreditCard, QrCode, type LucideIcon } from 'lucide-react';
import { Icon, type IconSize } from './Icon';

export const PAYMENT_ICON: Record<PaymentMode, LucideIcon> = {
  CASH: Banknote,
  UPI: QrCode,
  CARD: CreditCard,
};

/** The icon for a payment mode; always shown next to the mode's name, so it is decorative. */
export function PaymentIcon({
  mode,
  size = 'sm',
  className,
}: {
  mode: PaymentMode;
  size?: IconSize;
  className?: string;
}) {
  return <Icon as={PAYMENT_ICON[mode]} size={size} className={className} />;
}
```

`shared/ui/index.ts`: add

```ts
export { FoodMark } from './FoodMark';
export { Icon, ICON_SIZE, type IconSize } from './Icon';
export { PAYMENT_ICON, PaymentIcon } from './PaymentIcon';
```

- [ ] **Step 4: Run, expect PASS.** Then compute the food mark contrast against white (#ffffff) and surface-2 (#f5f5f4) with a quick node one-liner (relative luminance formula) and record the six ratios in the ledger; each must be ≥ 3:1. If one fails, darken that token and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/index.css apps/web/src/shared/ui
git commit -m "feat(web): Icon, FoodMark and PaymentIcon in the UI kit"
```

### Task 2: Food marks replace the coloured dots (staff app)

**Files:**
- Modify: `apps/web/src/features/menu/components/ItemRow.tsx`, `menu/pages/AvailabilityPage.tsx`, `orders/components/MenuBrowser.tsx`, `menu/types.ts`, `menu/index.ts`, and their tests if they query the old dot.

- [ ] **Step 1: Write the failing test.** In the existing `MenuBrowser` test file (find it with `ls apps/web/src/features/orders/components/*.test.tsx`; if none covers MenuBrowser, add to the POS page test that renders the menu), add:

```tsx
  it('marks each dish veg, non-veg or egg', async () => {
    // render as the existing tests in this file do, with a VEG and a NON_VEG dish in the fixture
    expect(await screen.findAllByRole('img', { name: 'Veg' })).not.toHaveLength(0);
    expect(screen.getAllByRole('img', { name: 'Non-veg' })).not.toHaveLength(0);
  });
```

Use the file's existing render helper and fixture (`apps/web/src/test/fixtures.ts` holds the shared menu fixture; make sure it has at least one `NON_VEG` dish, adding one there if not). Run it: expect FAIL (the dot in MenuBrowser has no role).

Run: `pnpm --filter @rpos/web exec vitest run src/features/orders src/features/service`

- [ ] **Step 2: Implement.** In each of the three components replace the dot span

```tsx
<span aria-label={FOOD_LABEL[item.foodType]} className={`... rounded-full ${FOOD_DOT[item.foodType]}`} ... />
```

with

```tsx
<FoodMark type={item.foodType} className="mt-0.5" />
```

(`import { FoodMark } from '@/shared/ui'`; keep the `mt-*` that aligned the old dot with the first text line.) Remove `FOOD_DOT` from `menu/types.ts` and its export from `menu/index.ts`; keep `FOOD_LABEL` if anything else uses it (grep), otherwise remove it too.

- [ ] **Step 3: Run menu, orders and service tests, expect PASS.** Fix any old test that selected the dot by class by switching it to `getByRole('img', { name: 'Veg' })`.

Run: `pnpm --filter @rpos/web exec vitest run src/features/menu src/features/orders src/features/service`

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): FSSAI-style food marks on the menu, availability and POS"
```

### Task 3: Payment mode icons

**Files:**
- Modify: `features/billing/components/SettlePanel.tsx`, `PaymentSheet.tsx`, `BillView.tsx`, `features/expenses/components/ExpenseForm.tsx`, `ExpenseList.tsx`, `features/day/pages/DayPage.tsx`, `features/reports/charts/PaymentDonut.tsx` (all under `apps/web/src/`)
- Test: `features/billing/components/SettlePanel.test.tsx` (existing)

- [ ] **Step 1: Write the failing test** in `SettlePanel.test.tsx`, using its existing render setup:

```tsx
  it('shows an icon and the key hint on each payment button', () => {
    // render the panel as the other tests in this file do
    for (const name of ['Cash', 'UPI', 'Card']) {
      const button = screen.getByRole('button', { name: new RegExp(`^${name}`) });
      expect(button.querySelector('svg.lucide')).not.toBeNull();
      expect(button.querySelector('kbd')).not.toBeNull();
    }
  });
```

Run, expect FAIL (no svg yet).

Run: `pnpm --filter @rpos/web exec vitest run src/features/billing`

- [ ] **Step 2: Implement.**
  - `SettlePanel.tsx` mode buttons: before `{m.label}` add `<PaymentIcon mode={m.mode} size="md" />`, and add `gap-2` to the button class (keep the `kbd`).
  - `PaymentSheet.tsx` mode buttons: same, `size="md"`, `inline-flex items-center justify-center gap-2` on the button.
  - `BillView.tsx` payment rows: put `<PaymentIcon mode={p.mode} />` before the label text (the row's label is a string prop today; if the row component only takes a string, render the icon in a wrapping `span className="inline-flex items-center gap-1.5"` via a `ReactNode` label, or leave BillView unchanged and ledger it if the row type would have to change for every caller).
  - `ExpenseForm.tsx` mode choices and `ExpenseList.tsx` meta line: `<PaymentIcon mode={…} />` before the mode name.
  - `DayPage.tsx` payments rows (Cash / UPI / Card in the day report): icon before each label.
  - `PaymentDonut.tsx` legend: keep the colour swatch, add `<PaymentIcon mode={r.key} className="text-muted" />` between swatch and label.

- [ ] **Step 3: Run billing, expenses, day and reports tests, expect PASS** (labels unchanged, so name queries still match; `^Cash` regex tolerates the kbd text).

Run: `pnpm --filter @rpos/web exec vitest run src/features/billing src/features/expenses src/features/day src/features/reports`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features
git commit -m "feat(web): payment mode icons wherever cash, UPI and card appear"
```

### Task 4: Action and order-type icons

**Files:** (all under `apps/web/src/features/`)
- Modify: `orders/components/OrderPanel.tsx` (Send to kitchen → `ChefHat`), `orders/components/ParcelList.tsx` (New parcel → `ShoppingBag`; parcel rows → `ShoppingBag` sm), `orders/components/FloorGrid.tsx` (area/table header for dine-in → `UtensilsCrossed` sm, only if there is a visible "Dine-in" label), `orders/components/qr/QrRequestCard.tsx` (Approve → `Check`, Reject → `X`), `billing/components/BillActions.tsx` (Void → `Ban`), the bill print button wherever "Print bill" is rendered (grep `Print bill`; → `Printer`), `menu/pages/MenuPage.tsx` (New dish → `Plus`, Change prices → `Percent`, Reorder → `ArrowUpDown`), `menu/components/ItemRow.tsx` row menu (Duplicate → `Copy`, Archive → `Archive`) if it uses `MenuItem` entries.
- Test: `orders/components/OrderPanel.test.tsx` or the POS page test that already clicks "Send to kitchen".

- [ ] **Step 1: Write the failing test** next to the existing Send to kitchen test:

```tsx
  it('shows a kitchen icon on Send to kitchen', async () => {
    // render as the neighbouring test does, with one unsent line
    const send = await screen.findByRole('button', { name: /^Send to kitchen/ });
    expect(send.querySelector('svg.lucide-chef-hat')).not.toBeNull();
  });
```

Run, expect FAIL.

Run: `pnpm --filter @rpos/web exec vitest run src/features/orders src/features/service`

- [ ] **Step 2: Implement.** For raw `<button className={primaryButton|secondaryButton}>` add `<ChefHat aria-hidden="true" />` (etc.) before the label; the kit class already sizes svgs to 16 px and spaces them (`[&_svg]:size-4`, gap). Where the kit `Button` is used, pass `icon={<Plus aria-hidden="true" />}`. Button text and accessible names do not change. While a button shows "Sending…", keep the icon (the label already says what is happening).

- [ ] **Step 3: Run the whole web suite, expect PASS.**

Run: `pnpm --filter @rpos/web test`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features
git commit -m "feat(web): icons on the main actions and on parcel and dine-in labels"
```

### Task 5: Empty states and icon size clean-up

**Files:**
- Modify: `features/menu/pages/AddonsPage.tsx` ("No add-on groups yet." → `EmptyState` with `ListPlus`), `features/tax/pages/TaxPage.tsx` ("No tax rates yet." → `Percent`), `features/kitchen-setup/pages/KitchenPage.tsx` ("No printers yet." → `Printer`); every lucide icon with an off-scale size.
- Test: the three pages' existing tests.

- [ ] **Step 1: Write the failing tests.** In each page's test file, in a test that renders the page with an empty list (add the empty fixture if the file has none):

```tsx
    expect(await screen.findByText('No add-on groups yet')).toBeInTheDocument();
    expect(screen.getByText('No add-on groups yet').closest('div')?.querySelector('svg')).not.toBeNull();
```

(Same pattern with "No tax rates yet" and "No printers yet".) Run, expect FAIL (today's text has a full stop and no icon).

Run: `pnpm --filter @rpos/web exec vitest run src/features/menu src/features/tax src/features/kitchen-setup`

- [ ] **Step 2: Implement** each with the kit:

```tsx
<EmptyState
  icon={<ListPlus />}
  title="No add-on groups yet"
  description="Add a group such as Extras, then attach it to dishes in the menu."
/>
```

Tax: title "No tax rates yet", description "Add the GST rate your dishes use, for example GST 5%." Printers: title "No printers yet", description "Add the printer at the counter or in the kitchen so bills and tickets print." If the empty text sits inside a `<ul>`, render the `EmptyState` instead of the list when empty (not inside an `li`).

- [ ] **Step 3: Snap off-scale icon sizes.** Run `grep -rnE "<[A-Z][A-Za-z0-9]+[^>]*className=\"[^\"]*size-(3|3\.5|7|8|9|10|11|12)\b" apps/web/src --include=*.tsx | grep -v test` and, for each match that is a lucide icon (not a button, avatar or box), change to `size-4`, `size-5` or `size-6` by role (inline / control / header). Leave non-icon elements alone. Note in the ledger which ones changed.

- [ ] **Step 4: Run the web suite, typecheck and lint, expect PASS.**

Run: `pnpm --filter @rpos/web test && pnpm typecheck && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): composed empty states for add-ons, tax and printers; icons on three sizes"
```

### Task 6: QR app icons and food marks

**Files:**
- Modify: `apps/qr/package.json` (add `lucide-react@^1.52.0`), `apps/qr/src/app/index.css`, `features/menu/components/Menu.tsx`, `ItemSheet.tsx`, `features/cart/components/Cart.tsx`, `features/requests/components/Requests.tsx`, `app/Ordering.tsx`
- Create: `apps/qr/src/shared/ui/Icon.tsx`, `apps/qr/src/shared/ui/FoodMark.tsx` (same code as Task 1's web versions, with `cn` replaced by template strings if qr has no `cn`), `apps/qr/src/shared/ui/icons.test.tsx`

- [ ] **Step 1: Add the dependency and tokens.** `pnpm --filter @rpos/qr add lucide-react@^1.52.0`. In `apps/qr/src/app/index.css` after `@import 'tailwindcss';`:

```css
@theme {
  /* Food marks (FSSAI style), same values as the staff app. */
  --color-veg: #15803d;
  --color-nonveg: #7c2d12;
  --color-egg: #b45309;
}
```

- [ ] **Step 2: Write the failing tests.**
  - `shared/ui/icons.test.tsx`: the `Icon` and `FoodMark` tests from Task 1 (without PaymentIcon).
  - In the existing QR menu test (`apps/qr/src/features/menu/components/*.test.tsx` or `app/Ordering.test.tsx`): each dish row has exactly one food-type name:

```tsx
    expect(screen.getAllByRole('img', { name: 'Veg' })).toHaveLength(vegDishCount);
```

  - In the cart test: the steppers are icons with names and 44 px targets:

```tsx
    const less = screen.getByRole('button', { name: /one less/i });
    expect(less.querySelector('svg.lucide-minus')).not.toBeNull();
    expect(less).toHaveClass('size-11');
```

  (Use the existing accessible names of the − / + buttons; read `Cart.tsx` and `ItemSheet.tsx` for them and keep them.)

Run, expect FAIL.

Run: `pnpm --filter @rpos/qr test`

- [ ] **Step 3: Implement.**
  - `Menu.tsx`: delete `DOT`; render `<FoodMark type={item.foodType} size={16} className="mt-1" />`.
  - `ItemSheet.tsx`: food mark beside the dish name; stepper `−`/`+` text → `<Minus aria-hidden="true" className="size-5" />` / `<Plus … />`, buttons `size-11` with their existing `aria-label`s.
  - `Cart.tsx`: same steppers; cart heading gets `ShoppingBag` (md); note field label gets `MessageSquare` (sm); send button gets `Send` (sm).
  - `Requests.tsx`: per state an icon before the state text: PENDING `Clock`, APPROVED `CircleCheck`, REJECTED `CircleX`, all `size-5`, `aria-hidden` (the text names the state).
  - `Ordering.tsx`: any back / close control gets `ChevronLeft` or `X` with an `aria-label`.

- [ ] **Step 4: Run QR tests, lint and typecheck, expect PASS.**

Run: `pnpm --filter @rpos/qr test && pnpm lint && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/qr pnpm-lock.yaml
git commit -m "feat(qr): lucide icons, food marks and icon steppers on the customer menu"
```

### Task 7: Docs, bundle and browser pass

**Files:**
- Modify: `apps/web/ARCHITECTURE.md`

- [ ] **Step 1: Docs.** Replace the "Icons" bullet in the UI kit section with:

```md
- **Icons** come from `lucide-react` (both apps), stroke 2, at three sizes through `Icon`
  (`sm` 16 px inline with text, `md` 20 px in controls and rows, `lg` 24 px in empty states and
  headers); kit buttons size their icons themselves. An icon beside text is `aria-hidden`; one
  that stands alone gets a `label`. Payment modes use `PaymentIcon`; veg / non-veg / egg use
  `FoodMark`, never a coloured dot.
```

- [ ] **Step 2: Bundle.** `pnpm --filter @rpos/web build` and `pnpm --filter @rpos/qr build`: web entry ≤ 260 kB gzip; record both entry sizes in the ledger.

- [ ] **Step 3: Browser pass** (api, web, qr dev servers; demo data):
  - POS: food marks on dishes, Send to kitchen icon, settle panel mode icons with C/U/K hints, Void icon.
  - Menu admin, Availability: food marks aligned with the first text line.
  - Kitchen display (dark): icons visible.
  - Day close and Reports legend: payment icons.
  - QR (`pnpm --filter @rpos/api db:qr-links` for a link): food marks, icon steppers, request state icons, at 375 px.

- [ ] **Step 4: Full check and commit**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm --filter @rpos/web test && pnpm --filter @rpos/qr test`

```bash
git add apps/web/ARCHITECTURE.md
git commit -m "docs(web): icon rules in the UI kit notes"
```

- [ ] **Step 5: Review and merge.** Fresh reviewer on the branch (code + apple-design lens on icons and marks); fix Critical/Important with tests; `git checkout main && git merge --no-ff feat/u5-icons`.
