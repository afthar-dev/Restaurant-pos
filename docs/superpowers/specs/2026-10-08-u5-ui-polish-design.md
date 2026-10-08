# U5: UI polish (charts, icons, visual refresh, QR restyle)

Date: 2026-10-08. Status: approved in chat, phase by phase.

## Why

The owner asked for "proper graph libraries and SVG icons for proper UI", judged against the
Apple Human Interface Guidelines (apple-design skill) and the taste-frontend rules.

An audit of the running app (demo data loaded) found:

- **Charts** are hand-built HTML bars (U3b chose no library to save bundle). Axis ticks land on
  odd values (₹33.3k), there are no tooltips, and the payment mix is one striped bar.
- **Icons**: the staff app uses lucide but sparsely, with eight different sizes. The QR app has
  no icons at all (text `−` / `+` steppers). Veg / non-veg is a 8–10 px coloured dot.
- **Look**: clean but generic. On a phone the header spends about 150 px on two status pills;
  every number sits in its own card; there is no dark appearance outside the kitchen screen.

Taste-frontend preflight: this is dense product UI, so its landing-page rules (hero, display
type, centred-hero ban) do not apply. Its density, state-completeness, icon-consistency and
hard-ban rules do (no em dashes in UI copy, no `01 / 02` eyebrows).

## Decisions (user-approved)

- Full pass in four phases, each its own branch, review and local merge.
- Charts: **Recharts 3**, loaded only with the screens that draw charts.
- Icons: **lucide-react** in both apps, fixed sizes, plus custom FSSAI-style food marks.
- Look: keep saffron and Inter; add a dark appearance that follows the device; compact
  header; fewer boxes; designed loading, empty and error states. The QR restyle replaces U4.

## Phase 1: Charts

### Library and loading

- Add `recharts@^3` to `apps/web`. It is about 100 kB gzip, so it must never enter the first
  bundle (budget: 45 kB over the 215 kB baseline, currently +40.6 kB).
- `features/reports/charts/` keeps the chart components; every file that imports `recharts`
  is reached only through `lazy()`:
  - `ReportsPage` is already lazy, so `SalesCharts` can import Recharts directly.
  - `WeekTrend` (home, first bundle) renders its card and takeaway eagerly and lazy-loads the
    chart body (`lazy(() => import('../charts/WeekBars'))`) inside `Suspense` with a chart-shaped
    `Skeleton` of the same height, so the card does not jump.
- An ESLint `no-restricted-imports` rule allows `recharts` only under
  `features/reports/charts/`, and a build check confirms the first bundle stays in budget.

### Charts

All charts share a `ChartFrame` (title, one-line takeaway, chart, optional legend), a
`ChartTooltip` (light card, tabular figures, date or hour, amount, bills), and colours from
CSS tokens read at render (`var(--color-…)`), so light and dark both work.

| Chart | Type | Details |
| --- | --- | --- |
| Sales by day | Vertical bars | Best day in `primary-600`, others in a muted saffron (`primary-200`; dark: `primary-800`). Rounded top corners (4 px). Hover/tap tooltip. Y axis 3–4 round ticks. |
| Busiest hours | Area with line | Service hours in order (existing `serviceHours`), gaps as zero. Peak hour marked with a dot and a small label. |
| How customers paid | Donut | Cash / UPI / Card in the validated `pay-*` palette, 2 px gaps between slices, total in the centre ("₹95,840" over "paid"). Legend list below with icon, amount and %. |
| Top dishes | Horizontal bars | Up to 8 dishes, names left, amounts at bar end, `primary-500`. |
| Home: Last 7 days | Compact bars | No axes or grid, today highlighted, tooltip only. Height 96 px. |

### Formatting

- Y ticks from a new `niceTicks(max, count = 4)` in `charts/scale.ts`: steps of 1, 2 or 5 ×
  10ⁿ only (drops the 2.5 step that produced ₹33.3k), labels through the existing
  `shortRupees` (₹850, ₹12k, ₹1.2L).
- Money in tooltips uses `rupees()`; every figure uses `tabular-nums`.

### Accessibility

- Each chart keeps its takeaway sentence as visible text, and the data tables below the
  charts stay, so nothing depends on seeing the chart.
- `accessibilityLayer` on: arrow keys move between bars or slices and announce the tooltip.
- The chart SVG gets `role="img"` and an `aria-label` that summarises it (existing summaries).
- `prefers-reduced-motion`: `isAnimationActive={false}`. Otherwise a single 400 ms grow-in.

### Tests

- jsdom has no layout: a test helper mocks `ResponsiveContainer` to a fixed size.
- Keep the behaviour tests from `BarChart.test.tsx` and `SalesCharts.test.tsx` (labels,
  takeaways, empty state, service-hour order) against the new components; add `niceTicks` unit
  tests; axe check on the reports screen.

## Phase 2: Icons

### System

- lucide in both apps (add `lucide-react` to `apps/qr`). Stroke 2 everywhere.
- `shared/ui/Icon.tsx` (web) and the QR equivalent: `<Icon as={Banknote} size="sm|md|lg" />`,
  with sm 16 px (inline with text), md 20 px (buttons, nav, list rows), lg 24 px (empty states,
  headers). Decorative by default (`aria-hidden`); `label` makes it `role="img"`.
- Replace ad-hoc `size-3.5`, `size-9` etc. on icons with the three sizes.

### Food marks (signature element)

A `FoodMark` component, one copy per app (`shared/ui/FoodMark.tsx` in web, the same in QR;
`packages/shared` holds no UI), inline SVG, 14 px default, 16 px on menus:

- VEG: green (`#15803d`) square outline, filled circle.
- NON_VEG: brown (`#7c2d12`) square outline, filled triangle (current FSSAI symbol).
- EGG: amber (`#b45309`) square outline, filled circle.

Each has `role="img"` and `aria-label` "Veg" / "Non-veg" / "Egg". Replaces `FOOD_DOT` in the
menu editor, availability, POS/captain menu browser and QR menu and item sheet.

### Where icons are added

- **Actions:** Send to kitchen (`ChefHat`), Settle (`IndianRupee`), Print bill (`Printer`),
  Add dish (`Plus`), Save (`Check`), Delete/Archive (`Trash2` / `Archive`), Approve /
  Reject QR order (`Check` / `X`), Duplicate (`Copy`), Reorder (`GripVertical`).
- **Payment modes:** Cash `Banknote`, UPI `QrCode`, Card `CreditCard`, in the settle panel,
  payment sheet, day close and the payments legend. One `PAYMENT_ICON` map in `features/billing`.
- **Order types:** Dine-in `UtensilsCrossed`, Parcel `ShoppingBag`.
- **Status:** low stock `TriangleAlert`, ticket ready `CircleCheck`, preparing `Flame`,
  online/offline `Wifi` / `WifiOff`, day open/closed `CalendarCheck` / `CalendarX`.
- **Empty states:** every `EmptyState` gets an lg icon that names the thing (no orders
  `ReceiptText`, no expenses `Wallet`, no stock `Package`, no staff `Users` …).
- **QR app:** cart `ShoppingBag`, steppers `Plus` / `Minus` (44 px targets), back
  `ChevronLeft`, note `MessageSquare`, request states `Clock` (waiting), `CircleCheck`
  (accepted), `CircleX` (not accepted).

### Tests

Existing tests query by role and name, so adding icons should not break them. Add tests for
`FoodMark` labels and `Icon` sizing/labelling; axe checks stay green.

## Phase 3: Staff app visual refresh

### Tokens and type

- Keep saffron primary and warm stone neutrals (rooted in the subject: an Indian kitchen).
- Add a **dark appearance** following `prefers-color-scheme`: the existing `[data-theme='dark']`
  values move into a shared block applied by the media query and by `data-theme='dark'` (the
  kitchen display keeps forcing dark). Add dark values for `primary-*` text and fills, status
  colours, chart tokens and shadows; check every text/background pair at 4.5:1 (3:1 for 18 px+
  or bold) and record the ratios in the spec addendum. No in-app appearance switch (HIG).
- Type scale (Inter, `tabular-nums` on all money and quantities): page title 24/30 semibold
  `tracking-tight`, section 18/24 semibold, body 15/22, small 13/18. Nothing under 13 px on
  POS, captain and kitchen screens.

### Shell

- **Mobile header: one row**: brand mark and name, then a single status button (coloured dot
  and icon: green online + day open, amber day closed, red offline), then the user avatar. The
  status button opens a popover with the two full statuses and the day-close link. Frees about
  100 px on phones.
- **Tab bar:** active tab uses a filled-weight treatment (icon in `primary-700`, label
  semibold, small pill behind the icon).
- **Sidebar (desktop):** group labels in 12 px sentence case `text-subtle` (no uppercase), active item with
  a saffron left rule rather than a filled block.

### Fewer boxes

- Reports summary: one strip (Sales, Bills, Average bill, Expenses, Net) divided by vertical
  rules on desktop, a 2-column grid on phones, inside one surface instead of five cards.
- Payments / order type / tax / expenses breakdowns: one grouped list with section labels.
- Home: today's figures as the same strip; setup card and Last 7 days stay cards.
- `Card` stays for things that float above the page: the order panel, sheets, the settle panel.

### States

- Skeletons shaped like the real layout for the floor grid, ticket columns, menu list, report
  strip and tables (shimmer off under reduced motion).
- Every list's empty state: icon, one sentence, the next action as a button.
- Errors keep `ErrorNote` with Retry; copy says what to do.

### Touch and motion

- 44 px minimum targets on POS, captain and kitchen (audit and fix any `min-h-9` controls).
- Motion: press feedback (`active:scale-[0.98]`), sheet slide-up, chart grow-in. Nothing else.

## Phase 4: QR app restyle (replaces U4)

- Same tokens (light and dark), Inter, lucide, `FoodMark`.
- Header: restaurant name and table ("Table T3"), photo-forward menu: 80 px thumbnails in the
  list, 16:9 photo in the item sheet.
- Category chips that stick under the header and scroll the menu.
- Sticky bottom cart bar: item count, total, "View order". Cart sheet with 44 px steppers.
- Request history with icon and colour per state, plus a plain sentence ("The staff accepted
  your order").
- Skeletons for the menu while loading; a composed screen for an invalid or expired QR.

## Process per phase

1. Plan in `docs/superpowers/plans/`, executed inline with the ledger.
2. Before/after screenshots at phone (375 px) and desktop widths, light and dark.
3. A fresh reviewer runs the apple-design review on the screenshots and code; Critical and
   High findings are fixed with tests before merge.
4. `pnpm lint && pnpm typecheck && pnpm test`, web build within the bundle budget, then
   `merge --no-ff` to main locally.

## Out of scope

- Logo upload (U3d, separate).
- New features or flow changes. Copy changes only where a label or empty state is unclear.
- Changing the brand colour or typeface.
