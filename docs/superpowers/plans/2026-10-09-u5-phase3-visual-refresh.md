# U5 Phase 3: Staff App Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The staff app follows the device's light or dark appearance, uses a one-row phone header, clearer navigation, fewer boxes for numbers, layout-shaped loading states and 44 px targets on service screens.

**Architecture:** Dark appearance is pure CSS: `app/index.css` redefines the semantic tokens and the status colour scales (amber, green, red, sky, violet) under `prefers-color-scheme: dark`, so the 46 files that use `bg-red-50 text-red-700`-style classes turn dark without edits. The few solid status fills (white text on red or green) move to non-inverting tokens. The phone header folds the server and day status into one status button with a popover. Report and home figures share a `StatStrip` kit component.

**Tech Stack:** React 19, Tailwind 4 (`@theme`, oklch palette), Radix popover via the kit's `DropdownMenu`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-u5-ui-polish-design.md` (Phase 3).

## Global Constraints

- Text contrast ≥ 4.5:1 (≥ 3:1 for 18 px+ or bold) in both appearances; graphical objects ≥ 3:1.
- No in-app appearance switch (HIG); the kitchen display keeps forcing dark via `data-theme="dark"`.
- Saffron primary and Inter stay; money and quantities `tabular-nums`.
- Nothing under 13 px on POS, captain and kitchen screens; touch targets ≥ 44 px there.
- First bundle ≤ 260 kB gzip.
- Existing accessible names and texts stay unless a task says otherwise, so current tests keep passing.
- No em dashes in UI sentences.

## Review Focus

- **Dark appearance on every status surface:** amber/red/green/sky/violet tints with their text stay ≥ 4.5:1 after inversion (Task 1's contrast test covers the pairs the code uses).
- **Solid fills under dark:** red and green buttons and badges with white text keep ≥ 4.5:1 (they must not invert).
- **Phone header when something is wrong:** server offline or day not open must still be visible without opening the popover.
- **Kitchen display:** unchanged look (already dark), late label readable.
- **Charts in dark:** bars, area and donut stay visible on the dark surface.

## File map

| File | Change |
| --- | --- |
| `apps/web/src/app/index.css` | dark tokens, inverted status scales, `--color-on-danger` etc. |
| `apps/web/src/app/theme.test.ts` | new: parses `index.css`, checks contrast of the pairs in use, light and dark |
| `apps/web/scripts/dark-palette.mjs` | new: generates the inverted scale block from Tailwind's `theme.css` |
| `apps/web/src/features/kitchen/pages/KdsPage.tsx`, `orders/components/order-panel/KotCard.tsx`, `service/components/OrderWorkspace.tsx`, `menu/pages/AvailabilityPage.tsx` | solid fills to tokens |
| `apps/web/src/app/shell/StatusButton.tsx` (+ test) | new: phone status button with popover |
| `apps/web/src/app/AppShell.tsx` | one-row phone header |
| `apps/web/src/app/shell/BottomNav.tsx`, `Sidebar.tsx` | active tab pill, sidebar active rule |
| `apps/web/src/shared/ui/StatStrip.tsx` (+ test) | new: one surface, figures divided by rules |
| `apps/web/src/features/reports/components/SummaryCards.tsx`, `app/home/HomePage.tsx` | use `StatStrip` |
| `apps/web/src/features/orders/components/FloorGrid.tsx`, `kitchen/pages/KdsPage.tsx`, `menu/pages/MenuPage.tsx` | layout-shaped skeletons |
| service-screen controls under 44 px | `min-h-11` |
| `apps/web/ARCHITECTURE.md` | dark appearance and StatStrip rules |

---

### Task 1: Dark appearance tokens with a contrast test

**Files:** `apps/web/scripts/dark-palette.mjs`, `apps/web/src/app/index.css`, `apps/web/src/app/theme.test.ts`, the four solid-fill files above.

**Interfaces:**
- Produces CSS tokens: `--color-danger-solid` / `--color-success-solid` (fills that carry white text in both appearances) used as `bg-danger-solid`, `bg-success-solid`; dark values for every existing semantic token.

- [ ] **Step 1: Write the failing test** `src/app/theme.test.ts`. It reads `index.css` and Tailwind's `theme.css` (path via `require.resolve('tailwindcss/theme.css')`), resolves each colour (hex or `oklch(L C H)`) to sRGB, and checks WCAG contrast:

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
const tw = readFileSync(createRequire(import.meta.url).resolve('tailwindcss/theme.css'), 'utf8');

/** Custom properties declared in a CSS block (first match wins). */
function vars(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) if (!out.has(m[1]!)) out.set(m[1]!, m[2]!.trim());
  return out;
}
const block = (marker: string) => {
  const at = css.indexOf(marker);
  if (at < 0) throw new Error(`missing block ${marker}`);
  return css.slice(at, css.indexOf('\n}', at));
};
const base = vars(tw);
const light = new Map([...base, ...vars(block('@theme {'))]);
const dark = new Map([...light, ...vars(block('/* dark appearance */'))]);

function srgb(value: string, table: Map<string, string>): [number, number, number] {
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (ref) return srgb(table.get(ref[1]!)!, table);
  if (value.startsWith('#')) {
    const h = value.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  }
  const m = value.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`cannot read colour ${value}`);
  const L = Number(m[1]) / 100, C = Number(m[2]), H = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(H), b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  return lin.map((c) => Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))) as [number, number, number];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
function ratio(fg: string, bg: string, table: Map<string, string>) {
  const x = lum(srgb(table.get(fg) ?? fg, table)), y = lum(srgb(table.get(bg) ?? bg, table));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Text pairs the screens use: [text token, background token, minimum].
const PAIRS: [string, string, number][] = [
  ['color-text', 'color-surface', 4.5],
  ['color-muted', 'color-surface', 4.5],
  ['color-subtle', 'color-surface', 4.5],
  ['color-muted', 'color-bg', 4.5],
  ['color-primary-800', 'color-surface', 4.5],
  ['color-red-700', 'color-surface', 4.5],
  ['color-red-700', 'color-red-50', 4.5],
  ['color-red-900', 'color-red-50', 4.5],
  ['color-green-800', 'color-surface', 4.5],
  ['color-green-800', 'color-green-50', 4.5],
  ['color-amber-900', 'color-amber-50', 4.5],
  ['color-amber-950', 'color-amber-50', 4.5],
  ['color-violet-900', 'color-violet-50', 4.5],
  ['color-sky-800', 'color-sky-50', 4.5],
  ['#ffffff', 'color-primary-700', 4.5],
  ['#ffffff', 'color-danger-solid', 4.5],
  ['#ffffff', 'color-success-solid', 4.5],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s appearance', (_name, table) => {
  it.each(PAIRS)('%s on %s is readable', (fg, bg, min) => {
    expect(ratio(fg, bg, table)).toBeGreaterThanOrEqual(min);
  });
});
```

Run `pnpm --filter @rpos/web exec vitest run src/app/theme.test.ts`: expect FAIL ("missing block /* dark appearance */" and the `*-solid` tokens).

- [ ] **Step 2: Generate the inverted status scales.** `scripts/dark-palette.mjs` reads Tailwind's `theme.css` and prints, for amber, green, red, sky and violet, `--color-<hue>-<step>: <value of the mirrored step>;` with the mapping 50↔950, 100↔900, 200↔800, 300↔700, 400↔600, 500↔500. Run it with `node apps/web/scripts/dark-palette.mjs` and paste its output into the dark block.

- [ ] **Step 3: Write the dark block** in `index.css` replacing the `[data-theme='dark']` block:

```css
/* Solid status fills carry white text in both appearances, so they do not invert. */
@theme {
  --color-danger-solid: #b91c1c;
  --color-success-solid: #15803d;
}

/* dark appearance */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    /* (same declarations as the [data-theme='dark'] rule below) */
  }
}
[data-theme='dark'] {
  --color-bg: #0c0a09;
  --color-surface: #1c1917;
  --color-surface-2: #292524;
  --color-border: #44403c;
  --color-border-strong: #57534e;
  --color-text: #fafaf9;
  --color-muted: #d6d3d1;
  --color-subtle: #a8a29e;
  /* Saffron tints for selection and hover become dark; link text becomes light. */
  --color-primary-50: #2a1609;
  --color-primary-100: #3b1d0b;
  --color-primary-200: #5c2a0e;
  --color-primary-300: #9a3412;
  --color-primary-800: #fdba74;
  --color-primary-900: #fed7aa;
  /* …generated status scales from Step 2… */
  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.5);
  --shadow-overlay: 0 10px 30px rgb(0 0 0 / 0.6);
  color-scheme: dark;
}
```

Write the declarations once in a shared place: put them in the `[data-theme='dark']` rule and repeat the identical list inside the media query (CSS cannot share a declaration list between an at-rule and a selector). Keep `primary-500/600/700` as they are: white text on `primary-700` stays 5.2:1, and the charts' `primary-600` bars stay visible on `#1c1917`.

Note: the test's `block('/* dark appearance */')` reads up to the first closing brace at line start, so place the full declaration list in the media-query copy first (the one directly after the marker).

- [ ] **Step 4: Move solid fills to tokens.** `KdsPage.tsx` cancel button `bg-red-700` → `bg-danger-solid`; `KotCard.tsx` READY `bg-green-600` → `bg-success-solid`; `OrderWorkspace.tsx` paid note `bg-green-700` → `bg-success-solid`; `AvailabilityPage.tsx` switch "on" colour → `bg-success-solid` if it is a green fill. Late badge `bg-amber-400 text-amber-950` stays (inverts to a mid amber with light text, still ≥ 4.5:1, covered by adding the pair `['color-amber-950','color-amber-400',4.5]` to `PAIRS`).

- [ ] **Step 5: Run the theme test, expect PASS.** If a pair fails in dark, adjust that token in the dark block (never in light) and re-run. Record the lowest ratio per appearance in the ledger.

- [ ] **Step 6: Run the web suite and lint; commit**

```bash
git add apps/web
git commit -m "feat(web): dark appearance that follows the device, checked for contrast"
```

### Task 2: One-row phone header with a status button

**Files:** create `apps/web/src/app/shell/StatusButton.tsx`, `StatusButton.test.tsx`; modify `apps/web/src/app/AppShell.tsx`.

**Interfaces:**
- Consumes: `ServerStatus`, `DayStatusPill` (unchanged, rendered inside the popover and on desktop), `useServerHealth`, `useRealtimeStatus`, `useBusinessDay`, `STALE_DAY_HOURS`.
- Produces: `StatusButton()`: a 44 px button labelled by the most important state.

States, most important first: server unreachable → red "Offline"; database down → red "Database down"; day not open → amber "Day not open"; day open over 20 h → amber "Old day open"; live updates paused → amber "Updates paused"; otherwise green "All good". The button shows a coloured dot, an icon and that short label; tapping it opens a menu (kit `DropdownMenu`) holding the full `ServerStatus` and `DayStatusPill` lines and their links. Visible label = accessible name prefix: `aria-label="Status: Offline"`.

- [ ] **Step 1: Failing tests** (`StatusButton.test.tsx`), rendering through `renderRoute('/expenses')` with mocked `/api/health` and `/api/business-day/current` as `shell.test.tsx` does:
  - all fine → `getByRole('button', { name: 'Status: All good' })`;
  - health request failing → `Status: Offline`;
  - `day: null` → `Status: Day not open`;
  - opening the button shows the text `Server online` and `/^Day open since/`.
  Run, expect FAIL.

- [ ] **Step 2: Implement** `StatusButton.tsx` with the kit `DropdownMenu` (`label="Status"`, trigger is the button). In `AppShell.tsx` phone header (`lg:hidden` parts): brand link left, `StatusButton` and `UserMenu` right, in one row; remove the second `w-full` row with `DayStatusPill`. Desktop keeps today's pills. Remove `flex-wrap` from the header.

- [ ] **Step 3: Run shell and StatusButton tests, expect PASS**; update any shell test that looked for the phone-only `DayStatusPill` row (desktop pill still renders in jsdom since `hidden lg:block` is CSS only).

- [ ] **Step 4: Commit** `feat(web): one-row phone header with a status button`.

### Task 3: Navigation polish

**Files:** `apps/web/src/app/shell/BottomNav.tsx`, `Sidebar.tsx`, `shell.test.tsx`.

- [ ] **Step 1: Failing test** in `shell.test.tsx`: on `/pos` at any width, the POS tab link has `aria-current="page"` and contains an element with class `bg-primary-100` (the pill behind its icon); `Sidebar` active link has class `border-primary-600`.
- [ ] **Step 2: Implement.** BottomNav active tab: icon wrapped in `<span className="flex h-7 w-12 items-center justify-center rounded-full bg-primary-100">`, label `font-semibold text-primary-800`; inactive label `text-muted`, tab text 12 px (`text-xs`). Sidebar active item: `border-l-2 border-primary-600 bg-transparent font-semibold text-primary-800` instead of a filled block; group labels 12 px sentence case `text-subtle`.
- [ ] **Step 3: Run tests, expect PASS; commit** `feat(web): clearer active tab and sidebar item`.

### Task 4: StatStrip for report and home figures

**Files:** create `apps/web/src/shared/ui/StatStrip.tsx` (+ export in `shared/ui/index.ts`), `StatStrip.test.tsx`; modify `features/reports/components/SummaryCards.tsx`, `app/home/HomePage.tsx`.

**Interfaces:**
- Produces: `StatStrip({ label, items }: { label: string; items: { label: string; value: string; tone?: 'bad' }[] })`: one `bg-surface` rounded surface, a `<dl>` grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` with `divide` rules between cells (`[&>div]:border-border` with left borders from `sm`), each cell `<dt>` 12 px `text-subtle` and `<dd>` 24 px semibold `tabular-nums`.

- [ ] **Step 1: Failing test** `StatStrip.test.tsx`: renders a `<dl>` named by `label` (`aria-label`), five `dt`/`dd` pairs, the `bad` value has `text-red-700`; axe passes.
- [ ] **Step 2: Implement**; in `SummaryCards.tsx` replace the five `Card`s with `<StatStrip label="Totals" items={…} />` and the three `Split` boxes with one surface holding three `<section>`s divided by `divide-y md:divide-y-0 md:divide-x`. On the home page, use `StatStrip` for today's figures where `StatCard`s sit side by side.
- [ ] **Step 3: Run reports, home and kit tests, expect PASS** (texts unchanged; tests that query `getByText('₹…')` still find them).
- [ ] **Step 4: Commit** `feat(web): report and home figures in one strip instead of five boxes`.

### Task 5: Layout-shaped skeletons and service touch targets

**Files:** `features/orders/components/FloorGrid.tsx`, `features/kitchen/pages/KdsPage.tsx`, `features/menu/pages/MenuPage.tsx`, plus any service control under 44 px.

- [ ] **Step 1: Failing tests:** while `/api/tables` (FloorGrid) is pending, the floor shows `role="status"` with name `Loading tables` and 8 skeleton tiles (`[data-skeleton="table"]`); KDS while tickets load shows `Loading tickets` with three column skeletons; menu admin `Loading menu` with list-row skeletons.
- [ ] **Step 2: Implement** each with the kit `Skeleton` in the real layout's grid classes, wrapped in `<div role="status" aria-label="Loading …">`.
- [ ] **Step 3: Touch targets.** `grep -rnE "min-h-(8|9|10)\b|h-(8|9|10) " apps/web/src/features/{orders,billing,kitchen,service} --include=*.tsx | grep -v test`; raise interactive ones to `min-h-11` (or `size-11` for icon buttons). Ledger the list.
- [ ] **Step 4: Run the web suite, expect PASS; commit** `feat(web): loading states shaped like the screen; 44 px targets on service screens`.

### Task 6: Docs, bundle, browser pass in both appearances

- [ ] **Step 1:** `ARCHITECTURE.md` UI kit: add "**Appearance:** light and dark follow the device; use tokens or the status scales (`bg-red-50 text-red-700` invert together in dark); white text only on `primary-700`, `danger-solid` or `success-solid`." and "**Figures** in a row use `StatStrip`, not a card per number."
- [ ] **Step 2:** `pnpm --filter @rpos/web build`: entry ≤ 260 kB gzip.
- [ ] **Step 3:** Browser: home, POS (order + settle), day close, reports (charts), menu admin, kitchen; each at phone width and desktop width, with `resize_window colorScheme: 'dark'` and `'light'`. Fix any unreadable spot with a test-backed change.
- [ ] **Step 4:** full checks, commit, fresh review (code + apple-design lens on screenshots), fix Critical/Important, merge `--no-ff`.
