# U5 Phase 1: Charts with Recharts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-built report and home charts with Recharts (tooltips, round axes, donut, area), loaded only with the screens that draw them.

**Architecture:** Bare chart components live in `apps/web/src/features/reports/charts/` and are the only files allowed to import `recharts` (ESLint). Callers wrap them in the existing `ChartFrame` (title + takeaway). `SalesCharts` is reached only through the lazy `ReportsPage`; the home `WeekTrend` renders its frame eagerly and lazy-loads its chart body. Every chart keeps a screen-reader list of its data points, so the accessible content does not depend on the SVG.

**Tech Stack:** React 19, Recharts 3.10 (already added to `apps/web/package.json` during planning), Tailwind 4 tokens, Vitest + Testing Library + vitest-axe.

**Spec:** `docs/superpowers/specs/2026-10-08-u5-ui-polish-design.md` (Phase 1).

## Global Constraints

- `recharts` imported only under `apps/web/src/features/reports/charts/` (ESLint `no-restricted-imports`).
- First bundle stays within 45 kB gzip of the 215 kB JS baseline (`pnpm --filter @rpos/web build`); Recharts must land in a lazy chunk.
- Colours come from CSS tokens (`var(--color-…)`), never hex in components.
- Money: `rupees()` for full amounts, `shortRupees()` for axis ticks; every figure `tabular-nums`.
- Animation off under `prefers-reduced-motion` (and when the preference cannot be read); otherwise 400 ms.
- No em dashes in UI copy; takeaways keep their current wording.
- Lint, typecheck and all web tests pass (`pnpm lint && pnpm typecheck && pnpm --filter @rpos/web test`).

## Review Focus

- **A range with one bill-less day among busy ones** (₹0 bar): the bar renders empty, its tooltip and screen-reader item still say "₹0 · 0 bills".
- **A single payment mode** (all UPI): the donut is one full ring, the legend still lists Cash and Card at ₹0 / 0%.
- **A month range (31 days)**: axis labels thin out (every 4th), no overlapping labels, every day still in the screen-reader list.
- **Late-night service (10pm to 1am)**: hours stay in service order, not 12am first.
- **Phone width (375 px)**: charts fit their card without horizontal scroll; donut and legend stack.

Tests for the first four are in Tasks 2, 3, 4 and 5; phone width is checked in Task 7's browser pass.

## Decisions taken while planning

- **Bar colours:** the spec suggested best day in `primary-600` and the rest in `primary-200`. `primary-200` on white is about 1.3:1, below the 3:1 that graphical objects need, so regular bars stay `primary-600` (3:1+) and the highlighted bar (best day, or today on the home card) is `primary-900`.
- **Top dishes stays an HTML ranked list** (already names left, bar, amount right). An SVG bar chart cannot truncate long dish names cleanly. It only gets a tidier bar and rounding in this phase.
- **Tests:** jsdom has no layout, so `src/test/setup.ts` mocks `ResponsiveContainer` to hand its child a fixed 600 px width (verified in a spike). Chart tests assert on our own markup (frame text, screen-reader lists, legend) plus `.recharts-rectangle` / `.recharts-sector` counts, not on Recharts internals beyond that.

## File map

| File | Change |
| --- | --- |
| `apps/web/src/features/reports/charts/scale.ts` | `niceTicks()` replaces `niceMax()` |
| `apps/web/src/features/reports/charts/types.ts` | new: `ChartPoint` |
| `apps/web/src/features/reports/charts/points.ts` | new: `dayPoints`, `serviceHours`, `hourPoints` (moved from `SalesCharts.tsx`) |
| `apps/web/src/features/reports/charts/motion.ts` | new: `prefersReducedMotion()` |
| `apps/web/src/features/reports/charts/ChartTooltip.tsx` | new: tooltip card |
| `apps/web/src/features/reports/charts/ChartData.tsx` | new: screen-reader list of points |
| `apps/web/src/features/reports/charts/ColumnChart.tsx` | new: vertical bars (sales by day, home week) |
| `apps/web/src/features/reports/charts/AreaTrend.tsx` | new: busiest hours |
| `apps/web/src/features/reports/charts/PaymentDonut.tsx` | new: replaces `PaymentMix.tsx` |
| `apps/web/src/features/reports/charts/TopDishes.tsx` | polish only |
| `apps/web/src/features/reports/charts/BarChart.tsx`, `BarChart.test.tsx`, `PaymentMix.tsx` | deleted |
| `apps/web/src/features/reports/components/SalesCharts.tsx` (+ test) | uses the new charts |
| `apps/web/src/features/reports/components/WeekTrend.tsx` | eager frame, lazy `ColumnChart` |
| `apps/web/src/app/home/HomePage.test.tsx` | week card assertions |
| `apps/web/src/test/setup.ts` | `ResponsiveContainer` mock |
| `eslint.config.mjs` | `recharts` restriction |
| `apps/web/ARCHITECTURE.md` | charts rule |

---

### Task 1: Round axis ticks

**Files:**
- Modify: `apps/web/src/features/reports/charts/scale.ts`
- Test: `apps/web/src/features/reports/charts/scale.test.ts`

**Interfaces:**
- Produces: `niceTicks(max: number, count?: number): number[]` (paise in, ascending ticks from 0, last tick ≥ max). `niceMax` is removed (only `BarChart.tsx` used it; that file is deleted in Task 6, so keep `niceMax` until then and delete it in Task 6).

- [ ] **Step 1: Write the failing test** (add to `scale.test.ts`, import `niceTicks`)

```ts
  it('puts axis ticks on 1, 2 or 5 times a power of ten', () => {
    expect(niceTicks(0)).toEqual([0]);
    // ₹26,546 → steps of ₹10k, not ₹33.3k thirds.
    expect(niceTicks(2_654_600)).toEqual([0, 1_000_000, 2_000_000, 3_000_000]);
    // ₹14,794 → ₹5k steps.
    expect(niceTicks(1_479_400)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    // Exactly on a step: no extra empty tick above.
    expect(niceTicks(2_000_000)).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
  });
```

- [ ] **Step 2: Run it, expect FAIL** (`niceTicks` is not exported)

Run: `pnpm --filter @rpos/web exec vitest run src/features/reports/charts/scale.test.ts`

- [ ] **Step 3: Implement** in `scale.ts`, below `niceMax`:

```ts
/**
 * Axis ticks from 0 in steps of 1, 2 or 5 × 10ⁿ, about `count` of them, the last one at or
 * above `max`. Thirds of a "nice" top (₹33.3k) read badly; whole steps (₹10k, ₹20k) do not.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const base = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * base).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}
```

Check against the test: 2_654_600/4 = 663_650 → base 100_000 → step 1_000_000 → top 3_000_000 ✓. 2_000_000/4 = 500_000 → step 500_000 → top 2_000_000 ✓. 7/4 = 1.75 → base 1 → step 2 → top 8 ✓.

- [ ] **Step 4: Run the test, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/reports/charts/scale.ts apps/web/src/features/reports/charts/scale.test.ts
git commit -m "feat(web): round axis ticks for charts"
```

### Task 2: Chart foundations (points, tooltip, screen-reader data, motion, test mock, lint rule)

**Files:**
- Create: `charts/types.ts`, `charts/points.ts`, `charts/points.test.ts`, `charts/motion.ts`, `charts/ChartTooltip.tsx`, `charts/ChartData.tsx`, `charts/ChartTooltip.test.tsx` (all under `apps/web/src/features/reports/`)
- Modify: `apps/web/src/features/reports/components/SalesCharts.tsx` (import the moved helpers), `apps/web/src/test/setup.ts`, `eslint.config.mjs`

**Interfaces:**
- Produces:
  - `interface ChartPoint { key: string; label: string; value: number; detail: string; highlight?: boolean }` (`value` in paise; `label` '' for thinned axis labels; `detail` like `"Sun 4 Oct · ₹26,546 · 35 bills"`).
  - `dayPoints(days: SalesReport['days'], highlightBest?: boolean): ChartPoint[]`
  - `serviceHours(busy: number[]): number[]`, `hourPoints(hours: SalesReport['hours']): ChartPoint[]`
  - `prefersReducedMotion(): boolean`
  - `ChartTooltip` (Recharts `content`), `ChartData({ title, points })` (sr-only list named `"<title> data"`).

- [ ] **Step 1: Write the failing tests**

`charts/points.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SalesReport } from '../types';
import { dayPoints, hourPoints } from './points';

const day = (dayId: string, date: string, total: number, bills: number) => ({
  dayId,
  date,
  status: 'CLOSED' as const,
  bills,
  total,
  cash: 0,
  upi: 0,
  card: 0,
  expenses: 0,
});

describe('chart points', () => {
  it('describes each day and marks the best one', () => {
    const points = dayPoints([day('a', '2026-10-09', 1_000_000, 7), day('b', '2026-10-10', 0, 0), day('c', '2026-10-11', 1_825_000, 10)], true);
    expect(points.map((p) => p.detail)).toEqual([
      'Fri 9 Oct · ₹10,000 · 7 bills',
      'Sat 10 Oct · ₹0 · 0 bills',
      'Sun 11 Oct · ₹18,250 · 10 bills',
    ]);
    expect(points.map((p) => p.highlight)).toEqual([false, false, true]);
  });

  it('thins a month of day labels to every fourth', () => {
    const month: SalesReport['days'] = Array.from({ length: 31 }, (_, i) =>
      day(String(i), `2026-10-${String(i + 1).padStart(2, '0')}`, 100_000, 1),
    );
    const labels = dayPoints(month).map((p) => p.label);
    expect(labels.filter(Boolean)).toHaveLength(8);
    expect(labels[0]).toBe('Thu 1');
    expect(labels[1]).toBe('');
  });

  it('keeps hours continuous and a late night next to the evening', () => {
    const points = hourPoints([
      { hour: 0, bills: 2, total: 100_000 },
      { hour: 1, bills: 1, total: 50_000 },
      { hour: 22, bills: 5, total: 400_000 },
      { hour: 23, bills: 3, total: 200_000 },
    ]);
    expect(points.map((p) => p.detail.split(' · ')[0])).toEqual([
      '10pm–11pm',
      '11pm–12am',
      '12am–1am',
      '1am–2am',
    ]);
    const gap = hourPoints([
      { hour: 13, bills: 14, total: 840_000 },
      { hour: 15, bills: 3, total: 150_000 },
    ]);
    expect(gap.map((p) => p.detail)).toEqual([
      '1pm–2pm · ₹8,400 · 14 bills',
      '2pm–3pm · ₹0 · 0 bills',
      '3pm–4pm · ₹1,500 · 3 bills',
    ]);
  });
});
```

`charts/ChartTooltip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartData } from './ChartData';
import { ChartTooltip } from './ChartTooltip';

const point = { key: 'a', label: 'Sun 4', value: 2_654_600, detail: 'Sun 4 Oct · ₹26,546 · 35 bills' };

describe('ChartTooltip', () => {
  it('shows the point name over its figures', () => {
    render(<ChartTooltip active payload={[{ payload: point }]} />);
    expect(screen.getByText('Sun 4 Oct')).toHaveClass('font-semibold');
    expect(screen.getByText('₹26,546 · 35 bills')).toHaveClass('tabular-nums');
  });

  it('renders nothing when inactive', () => {
    const { container } = render(<ChartTooltip active={false} payload={[{ payload: point }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ChartData', () => {
  it('lists every point for screen readers', () => {
    render(<ChartData title="Sales by day" points={[point]} />);
    const list = screen.getByRole('list', { name: 'Sales by day data' });
    expect(list).toHaveClass('sr-only');
    expect(list).toHaveTextContent('Sun 4 Oct · ₹26,546 · 35 bills');
  });
});
```

- [ ] **Step 2: Run them, expect FAIL** (modules missing)

Run: `pnpm --filter @rpos/web exec vitest run src/features/reports/charts`

- [ ] **Step 3: Implement**

`charts/types.ts`:

```ts
/** One bar or point on a chart. */
export interface ChartPoint {
  key: string;
  /** Axis label; empty for labels thinned out. */
  label: string;
  /** Paise. */
  value: number;
  /** Tooltip and screen-reader text, e.g. "Sat 10 Oct · ₹18,250 · 42 bills". */
  detail: string;
  /** Drawn darker: the best day, or today on the home card. */
  highlight?: boolean;
}
```

`charts/points.ts` (moves `serviceHours` and the day/hour builders out of `SalesCharts.tsx`; remove them from there and import from here):

```ts
import { rupees } from '@/shared/lib/money';
import type { SalesReport } from '../types';
import { billCount, dayLabel, hourLabel, hourRange, shortDayLabel } from './scale';
import type { ChartPoint } from './types';

/** One point per business day; about eight axis labels whatever the range. */
export function dayPoints(days: SalesReport['days'], highlightBest = false): ChartPoint[] {
  const every = Math.ceil(days.length / 8);
  const best = highlightBest
    ? days.reduce((a, b) => (b.total > a.total ? b : a), days[0]!)
    : undefined;
  return days.map((d, i) => ({
    key: d.dayId,
    label: i % every === 0 ? shortDayLabel(d.date) : '',
    value: d.total,
    detail: `${dayLabel(d.date)} · ${rupees(d.total)} · ${billCount(d.bills)}`,
    highlight: d === best,
  }));
}

/**
 * The hours in service order: the day starts after the longest quiet stretch, so a late night
 * (11pm, 12am, 1am) sits next to the evening instead of at the far left.
 */
export function serviceHours(busy: number[]): number[] {
  const sorted = [...new Set(busy)].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted;
  let start = sorted[0]!;
  let gap = -1;
  sorted.forEach((hour, i) => {
    const next = sorted[(i + 1) % sorted.length]!;
    const quiet = (next - hour + 24) % 24;
    if (quiet > gap) {
      gap = quiet;
      start = next;
    }
  });
  return Array.from({ length: 24 - gap + 1 }, (_, k) => (start + k) % 24);
}

/** Every hour from the first to the last with sales, so quiet hours show as zero. */
export function hourPoints(hours: SalesReport['hours']): ChartPoint[] {
  const order = serviceHours(hours.map((h) => h.hour));
  const first = order[0];
  return order.map((h) => {
    const row = hours.find((x) => x.hour === h);
    const total = row?.total ?? 0;
    return {
      key: String(h),
      label: h % 3 === 0 || h === first ? hourLabel(h) : '',
      value: total,
      detail: `${hourRange(h)} · ${rupees(total)} · ${billCount(row?.bills ?? 0)}`,
    };
  });
}
```

Note `dayPoints` with `highlightBest=false` gives `highlight: false` for all (`d === undefined` is false); the month test does not check it.

`charts/motion.ts`:

```ts
/** True when the person asked for less motion, or when we cannot tell (tests, old browsers). */
export function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const CHART_ANIMATION_MS = 400;
```

`charts/ChartTooltip.tsx`:

```tsx
import type { ChartPoint } from './types';

/** Recharts tooltip content: the point's name, then its figures. */
export function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  const [name, ...figures] = point.detail.split(' · ');
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-overlay">
      <p className="font-semibold text-text">{name}</p>
      {figures.length > 0 && <p className="text-muted tabular-nums">{figures.join(' · ')}</p>}
    </div>
  );
}
```

`charts/ChartData.tsx`:

```tsx
import type { ChartPoint } from './types';

/** The chart's points as text, for screen readers; the SVG itself is for sighted people. */
export function ChartData({ title, points }: { title: string; points: ChartPoint[] }) {
  return (
    <ul aria-label={`${title} data`} className="sr-only">
      {points.map((p) => (
        <li key={p.key}>{p.detail}</li>
      ))}
    </ul>
  );
}
```

`apps/web/src/test/setup.ts`, after the canvas stub, add (imports `cloneElement`, `ReactElement` from `react` at the top):

```ts
// jsdom has no layout, so ResponsiveContainer would measure 0 × 0 and draw nothing.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
      height,
    }: {
      children: ReactElement<{ width?: number; height?: number }>;
      height?: number | string;
    }) => cloneElement(children, { width: 600, height: typeof height === 'number' ? height : 240 }),
  };
});
```

`eslint.config.mjs`: inside `boundaries()`, add

```js
  const recharts = {
    name: 'recharts',
    message: 'Charts live in features/reports/charts/ so Recharts stays out of the first bundle.',
  };
```

append `recharts` to the `paths` array of the `features/**`, `features/*/components|pages`, `app/**` and `shared/**` blocks (pass `[recharts]` as the second argument where there is none), and add a last block that lifts it for the charts folder:

```js
    {
      files: [`${src}/features/reports/charts/**/*.{ts,tsx}`],
      rules: restrict([appWiring, featureInternals], [http]),
    },
```

- [ ] **Step 4: Run tests and lint, expect PASS**

Run: `pnpm --filter @rpos/web exec vitest run src/features/reports` then `pnpm lint`.
Also prove the rule: temporarily add `import 'recharts';` to `components/WeekTrend.tsx`, run `pnpm lint`, expect the "Charts live in features/reports/charts/" error, then remove the line.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs apps/web/src/test/setup.ts apps/web/src/features/reports
git commit -m "feat(web): chart points, tooltip and screen-reader data for Recharts"
```

### Task 3: Column chart (sales by day)

**Files:**
- Create: `apps/web/src/features/reports/charts/ColumnChart.tsx`, `ColumnChart.test.tsx`
- Modify: `apps/web/src/features/reports/components/SalesCharts.tsx`, `SalesCharts.test.tsx`

**Interfaces:**
- Consumes: `ChartPoint`, `niceTicks`, `shortRupees`, `ChartTooltip`, `ChartData`, `prefersReducedMotion`, `CHART_ANIMATION_MS`.
- Produces: `ColumnChart({ title, points, height = 200, compact = false }: { title: string; points: ChartPoint[]; height?: number; compact?: boolean })`. Default export too (for `lazy()` in Task 6): `export default ColumnChart`.

- [ ] **Step 1: Write the failing test** (`ColumnChart.test.tsx`)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { ColumnChart } from './ColumnChart';
import type { ChartPoint } from './types';

const POINTS: ChartPoint[] = [
  { key: 'a', label: 'Fri 2', value: 1_601_400, detail: 'Fri 2 Oct · ₹16,014 · 22 bills' },
  { key: 'b', label: 'Sat 3', value: 0, detail: 'Sat 3 Oct · ₹0 · 0 bills' },
  { key: 'c', label: 'Sun 4', value: 2_654_600, detail: 'Sun 4 Oct · ₹26,546 · 35 bills', highlight: true },
];

describe('ColumnChart', () => {
  it('draws a bar per point on round ticks, with the data for screen readers', () => {
    render(
      <main>
        <ColumnChart title="Sales by day" points={POINTS} />
      </main>,
    );
    expect(document.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(3);
    for (const tick of ['₹0', '₹10k', '₹20k', '₹30k']) expect(screen.getByText(tick)).toBeInTheDocument();
    expect(screen.queryByText('₹33.3k')).toBeNull();
    const data = screen.getByRole('list', { name: 'Sales by day data' });
    expect(data).toHaveTextContent('Sat 3 Oct · ₹0 · 0 bills');
  });

  it('marks the highlighted bar darker', () => {
    render(<ColumnChart title="Sales by day" points={POINTS} />);
    const fills = [...document.querySelectorAll('.recharts-bar-rectangle path')].map((p) => p.getAttribute('fill'));
    expect(fills).toContain('var(--color-primary-900)');
    expect(fills.filter((f) => f === 'var(--color-primary-600)')).toHaveLength(1); // ₹0 bar draws no path
  });

  it('drops the axes when compact', () => {
    render(<ColumnChart title="Last 7 days" points={POINTS} compact height={96} />);
    expect(screen.queryByText('₹10k')).toBeNull();
    expect(document.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(3);
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <ColumnChart title="Sales by day" points={POINTS} />
      </main>,
    );
    await expectNoAxeViolations();
  });
});
```

If the zero-height bar does draw a `path` in Recharts 3.10, change the second assertion's expected count to 2 and keep the `primary-900` check; the point of the test is that exactly the highlighted bar is dark.

- [ ] **Step 2: Run, expect FAIL** (module missing)

Run: `pnpm --filter @rpos/web exec vitest run src/features/reports/charts/ColumnChart.test.tsx`

- [ ] **Step 3: Implement** `ColumnChart.tsx`

```tsx
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartData } from './ChartData';
import { ChartTooltip } from './ChartTooltip';
import { CHART_ANIMATION_MS, prefersReducedMotion } from './motion';
import { niceTicks, shortRupees } from './scale';
import type { ChartPoint } from './types';

const AXIS_TICK = { fill: 'var(--color-subtle)', fontSize: 12 };

/** Vertical bars from a zero baseline; `compact` drops the axes and grid for small cards. */
export function ColumnChart({
  title,
  points,
  height = 200,
  compact = false,
}: {
  title: string;
  points: ChartPoint[];
  height?: number;
  compact?: boolean;
}) {
  const ticks = niceTicks(Math.max(0, ...points.map((p) => p.value)));
  const still = prefersReducedMotion();
  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={points} title={title} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          {!compact && <CartesianGrid vertical={false} stroke="var(--color-border)" />}
          <XAxis
            dataKey="label"
            interval={0}
            hide={compact}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border-strong)' }}
            tick={AXIS_TICK}
          />
          <YAxis
            hide={compact}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]!]}
            tickFormatter={shortRupees}
            tickLine={false}
            axisLine={false}
            width={48}
            tick={AXIS_TICK}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-2)' }} />
          <Bar
            dataKey="value"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={!still}
            animationDuration={CHART_ANIMATION_MS}
          >
            {points.map((p) => (
              <Cell
                key={p.key}
                // 600 keeps 3:1 against white; the highlighted bar is darker still.
                fill={p.highlight ? 'var(--color-primary-900)' : 'var(--color-primary-600)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ChartData title={title} points={points} />
    </div>
  );
}

export default ColumnChart;
```

- [ ] **Step 4: Run the test, expect PASS.** If the `fill` attributes are not on `path` elements, inspect with `screen.debug()` and point the selector at the element that carries `fill` (keep the assertion).

- [ ] **Step 5: Use it in `SalesCharts.tsx`** for Sales by day

Replace the Sales by day `BarChart` with:

```tsx
            <ChartFrame
              title="Sales by day"
              takeaway={`Best day: ${dayLabel(bestDay.date)}, ${rupees(bestDay.total)}`}
            >
              <ColumnChart title="Sales by day" points={dayPoints(days, true)} />
            </ChartFrame>
```

(import `ChartFrame` from `../charts/ChartFrame`, `ColumnChart` from `../charts/ColumnChart`, `dayPoints` from `../charts/points`; delete the local `dayBars`.) Busiest hours keeps the old `BarChart` until Task 4, fed by `hourPoints(hours)` (same shape as `Bar`).

In `SalesCharts.test.tsx`, the takeaway test is unchanged. Add:

```tsx
  it('lists every day for screen readers', () => {
    render(<SalesCharts report={REPORT} />);
    expect(screen.getByRole('list', { name: 'Sales by day data' })).toHaveTextContent(
      'Sat 10 Oct · ₹18,250 · 10 bills',
    );
  });
```

- [ ] **Step 6: Run reports tests, expect PASS**

Run: `pnpm --filter @rpos/web exec vitest run src/features/reports`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/reports
git commit -m "feat(web): sales by day as a Recharts column chart"
```

### Task 4: Busiest hours area chart

**Files:**
- Create: `apps/web/src/features/reports/charts/AreaTrend.tsx`, `AreaTrend.test.tsx`
- Modify: `apps/web/src/features/reports/components/SalesCharts.tsx`, `SalesCharts.test.tsx`

**Interfaces:**
- Consumes: as Task 3.
- Produces: `AreaTrend({ title, points, height = 200 }: { title: string; points: ChartPoint[]; height?: number })`; the highest point gets a dot.

- [ ] **Step 1: Write the failing test** (`AreaTrend.test.tsx`)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { AreaTrend } from './AreaTrend';
import type { ChartPoint } from './types';

const POINTS: ChartPoint[] = [
  { key: '13', label: '1pm', value: 840_000, detail: '1pm–2pm · ₹8,400 · 14 bills' },
  { key: '14', label: '', value: 0, detail: '2pm–3pm · ₹0 · 0 bills' },
  { key: '15', label: '3pm', value: 150_000, detail: '3pm–4pm · ₹1,500 · 3 bills' },
];

describe('AreaTrend', () => {
  it('draws the line with the peak marked and round ticks', () => {
    render(
      <main>
        <AreaTrend title="Busiest hours" points={POINTS} />
      </main>,
    );
    expect(document.querySelector('.recharts-area-curve')).not.toBeNull();
    expect(document.querySelectorAll('.recharts-reference-dot')).toHaveLength(1);
    expect(screen.getByText('₹10k')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Busiest hours data' })).toHaveTextContent('2pm–3pm · ₹0 · 0 bills');
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <AreaTrend title="Busiest hours" points={POINTS} />
      </main>,
    );
    await expectNoAxeViolations();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter @rpos/web exec vitest run src/features/reports/charts/AreaTrend.test.tsx`

- [ ] **Step 3: Implement** `AreaTrend.tsx`

```tsx
import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartData } from './ChartData';
import { ChartTooltip } from './ChartTooltip';
import { CHART_ANIMATION_MS, prefersReducedMotion } from './motion';
import { niceTicks, shortRupees } from './scale';
import type { ChartPoint } from './types';

const AXIS_TICK = { fill: 'var(--color-subtle)', fontSize: 12 };

/** A filled line over the service hours; the busiest hour gets a dot. */
export function AreaTrend({
  title,
  points,
  height = 200,
}: {
  title: string;
  points: ChartPoint[];
  height?: number;
}) {
  const fade = useId();
  const ticks = niceTicks(Math.max(0, ...points.map((p) => p.value)));
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]!);
  const still = prefersReducedMotion();
  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} title={title} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            interval={0}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border-strong)' }}
            tick={AXIS_TICK}
          />
          <YAxis
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]!]}
            tickFormatter={shortRupees}
            tickLine={false}
            axisLine={false}
            width={48}
            tick={AXIS_TICK}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--color-border-strong)' }} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-primary-600)"
            strokeWidth={2}
            fill={`url(#${fade})`}
            isAnimationActive={!still}
            animationDuration={CHART_ANIMATION_MS}
          />
          {peak.value > 0 && (
            <ReferenceDot
              x={peak.label || undefined}
              y={peak.value}
              r={5}
              fill="var(--color-primary-700)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      <ChartData title={title} points={points} />
    </div>
  );
}
```

`ReferenceDot` needs an x that matches a category: if the peak's label is thinned (''), switch the XAxis `dataKey` to `"key"` with `tickFormatter={(key) => points.find((p) => p.key === key)?.label ?? ''}` and set `x={peak.key}`. Do this from the start if the test shows no dot for a thinned peak; the safer version is the `key` one, so prefer it:

```tsx
          <XAxis
            dataKey="key"
            interval={0}
            tickFormatter={(key: string) => points.find((p) => p.key === key)?.label ?? ''}
            ...
          />
          ...
            <ReferenceDot x={peak.key} y={peak.value} ... />
```

Add a test case for a thinned peak: change `POINTS[1]` value to 900_000 in a second render and expect one `.recharts-reference-dot`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Use it in `SalesCharts.tsx`**

```tsx
            <ChartFrame
              title="Busiest hours"
              takeaway={`Busiest: ${hourRange(peak.hour)}, ${rupees(peak.total)} from ${billCount(peak.bills)}`}
            >
              <AreaTrend title="Busiest hours" points={hourPoints(hours)} />
            </ChartFrame>
```

Replace the two `SalesCharts.test.tsx` hour tests ("keeps the hours continuous…" and "keeps a late night…", which query `group` / `img`) with one that reads the screen-reader list (the ordering logic itself is covered in `points.test.ts`):

```tsx
  it('lists every service hour, quiet ones included', () => {
    render(<SalesCharts report={REPORT} />);
    const items = within(screen.getByRole('list', { name: 'Busiest hours data' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      '1pm–2pm · ₹8,400 · 14 bills',
      '2pm–3pm · ₹0 · 0 bills',
      '3pm–4pm · ₹1,500 · 3 bills',
    ]);
  });
```

In the axe test, drop `fireEvent.focus(screen.getAllByRole('img')[0]!)`.

- [ ] **Step 6: Run reports tests, expect PASS.**

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/reports
git commit -m "feat(web): busiest hours as an area chart with the peak marked"
```

### Task 5: Payment donut and top dishes polish

**Files:**
- Create: `apps/web/src/features/reports/charts/PaymentDonut.tsx`, `PaymentDonut.test.tsx`
- Delete: `apps/web/src/features/reports/charts/PaymentMix.tsx`
- Modify: `charts/TopDishes.tsx`, `components/SalesCharts.tsx`, `components/SalesCharts.test.tsx`

**Interfaces:**
- Produces: `PaymentDonut({ payments }: { payments: { CASH: number; UPI: number; CARD: number } })`, rendering its own `ChartFrame` like `PaymentMix` did (title "How customers paid", same takeaway), the donut with the total in the centre, and the `Payment modes` legend.

- [ ] **Step 1: Write the failing test** (`PaymentDonut.test.tsx`)

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { PaymentDonut } from './PaymentDonut';

describe('PaymentDonut', () => {
  it('shows the total in the middle, a slice per used mode and every mode in the legend', () => {
    render(
      <main>
        <PaymentDonut payments={{ CASH: 500_000, UPI: 1_000_000, CARD: 0 }} />
      </main>,
    );
    expect(screen.getByText('Most paid by UPI: 67%')).toBeInTheDocument();
    expect(screen.getByText('₹15,000')).toBeInTheDocument();
    expect(document.querySelectorAll('.recharts-pie-sector')).toHaveLength(2);
    const legend = within(screen.getByRole('list', { name: 'Payment modes' }));
    expect(legend.getByText('Card').closest('li')).toHaveTextContent('Card₹00%');
    expect(legend.getByText('Cash').closest('li')).toHaveTextContent('Cash₹5,00033%');
  });

  it('draws one full ring when everyone paid the same way', () => {
    render(<PaymentDonut payments={{ CASH: 0, UPI: 900_000, CARD: 0 }} />);
    expect(document.querySelectorAll('.recharts-pie-sector')).toHaveLength(1);
    expect(screen.getByText('Most paid by UPI: 100%')).toBeInTheDocument();
  });

  it('draws nothing without payments', () => {
    const { container } = render(<PaymentDonut payments={{ CASH: 0, UPI: 0, CARD: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no accessibility problems', async () => {
    render(
      <main>
        <PaymentDonut payments={{ CASH: 500_000, UPI: 1_000_000, CARD: 0 }} />
      </main>,
    );
    await expectNoAxeViolations();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter @rpos/web exec vitest run src/features/reports/charts/PaymentDonut.test.tsx`

- [ ] **Step 3: Implement** `PaymentDonut.tsx`

```tsx
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/shared/lib/cn';
import { rupees } from '@/shared/lib/money';
import { ChartFrame } from './ChartFrame';
import { CHART_ANIMATION_MS, prefersReducedMotion } from './motion';

const MODES = [
  { key: 'CASH', label: 'Cash', color: 'var(--color-pay-cash)', swatch: 'bg-pay-cash' },
  { key: 'UPI', label: 'UPI', color: 'var(--color-pay-upi)', swatch: 'bg-pay-upi' },
  { key: 'CARD', label: 'Card', color: 'var(--color-pay-card)', swatch: 'bg-pay-card' },
] as const;

type Payments = Record<(typeof MODES)[number]['key'], number>;

/** A donut of cash, UPI and card with the total inside, and every amount and share listed. */
export function PaymentDonut({ payments }: { payments: Payments }) {
  const total = payments.CASH + payments.UPI + payments.CARD;
  if (total <= 0) return null;
  const rows = MODES.map((m) => ({
    ...m,
    amount: payments[m.key],
    percent: Math.round((payments[m.key] / total) * 100),
  }));
  const top = rows.reduce((a, b) => (b.amount > a.amount ? b : a));
  const used = rows.filter((r) => r.amount > 0);
  const still = prefersReducedMotion();

  return (
    <ChartFrame title="How customers paid" takeaway={`Most paid by ${top.label}: ${top.percent}%`}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="relative size-44 shrink-0" aria-hidden="true">
          <ResponsiveContainer width="100%" height={176}>
            <PieChart accessibilityLayer={false}>
              <Pie
                data={used}
                dataKey="amount"
                nameKey="label"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={used.length > 1 ? 2 : 0}
                cornerRadius={4}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                isAnimationActive={!still}
                animationDuration={CHART_ANIMATION_MS}
              >
                {used.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums">{rupees(total)}</span>
            <span className="text-xs text-muted">paid</span>
          </div>
        </div>
        <ul aria-label="Payment modes" className="flex w-full flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2">
              <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-sm', r.swatch)} />
              <span className="flex-1 text-text">{r.label}</span>
              <span className="font-medium tabular-nums">{rupees(r.amount)}</span>
              <span className="w-10 text-right text-muted tabular-nums">{`${r.percent}%`}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}
```

The donut is `aria-hidden` (the legend says everything it shows) and has `accessibilityLayer={false}`, so there is no focusable element inside a hidden region. If the centre total duplicates text for the `getByText('₹15,000')` query, that is fine: it is the only ₹15,000 on this component.

`TopDishes.tsx`: change the track to `h-2 rounded-full bg-surface-2` and the fill to `rounded-full bg-primary-600`, put the amount in `text-right`, and widen the name column to `minmax(0,11rem)`. No behaviour change; its existing tests (in `SalesCharts.test.tsx`) stay.

- [ ] **Step 4: Swap it into `SalesCharts.tsx`** (`<PaymentDonut payments={summary.payments} />`), delete `PaymentMix.tsx`, and in `SalesCharts.test.tsx` replace the "lists every payment mode, skipping the empty segment" test's last assertion (the striped bar's `img` children) with:

```tsx
    expect(document.querySelectorAll('.recharts-pie-sector')).toHaveLength(2);
```

- [ ] **Step 5: Run reports tests, expect PASS.**

Run: `pnpm --filter @rpos/web exec vitest run src/features/reports`

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src/features/reports
git commit -m "feat(web): payment mix as a donut with the total inside"
```

### Task 6: Home card lazy chart, remove the old bar chart

**Files:**
- Modify: `apps/web/src/features/reports/components/WeekTrend.tsx`, `apps/web/src/app/home/HomePage.test.tsx`, `apps/web/src/features/reports/charts/scale.ts`, `scale.test.ts`
- Delete: `apps/web/src/features/reports/charts/BarChart.tsx`, `BarChart.test.tsx`

**Interfaces:**
- Consumes: `ColumnChart` default export, `ChartFrame`, `ChartPoint`.

- [ ] **Step 1: Update the failing home test** (`HomePage.test.tsx`, the Last 7 days test), replacing the `group`/`img` lines:

```tsx
    const data = within(await screen.findByRole('list', { name: 'Last 7 days data' }));
    const days = data.getAllByRole('listitem');
    expect(days).toHaveLength(7);
    expect(days[5]).toHaveTextContent('₹2,000 · 4 bills');
    expect(days[4]).toHaveTextContent('₹0 · 0 bills');
    expect(document.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(7);
```

- [ ] **Step 2: Run, expect FAIL** (no such list yet).

Run: `pnpm --filter @rpos/web exec vitest run src/app/home`

- [ ] **Step 3: Implement** `WeekTrend.tsx`

```tsx
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody, Skeleton } from '@/shared/ui';
import { ChartFrame } from '../charts/ChartFrame';
import { billCount, dayLabel, shortDayLabel } from '../charts/scale';
import type { ChartPoint } from '../charts/types';
import { useSalesReport } from '../queries';
import { datesInRange, presetRange } from '../ranges';

// Recharts is big: the home screen loads it after the card's text is on screen.
const ColumnChart = lazy(() => import('../charts/ColumnChart'));

const HEIGHT = 96;

/** Owner home: the last seven India dates, today highlighted; closed days are empty slots. */
export function WeekTrend() {
  // Worked out on each render, so a screen left open overnight moves to the new day.
  const range = presetRange('last7Days');
  const report = useSalesReport(range);
  if (report.isError) return null;
  if (!report.data) return <Skeleton className="h-44" />;

  const byDate = new Map<string, { total: number; bills: number }>();
  for (const d of report.data.days) {
    const t = byDate.get(d.date) ?? { total: 0, bills: 0 };
    byDate.set(d.date, { total: t.total + d.total, bills: t.bills + d.bills });
  }
  const week = [...byDate.entries()]
    .filter(([date]) => date >= range.from && date <= range.to)
    .reduce((n, [, t]) => n + t.total, 0);
  const today = byDate.get(range.to)?.total ?? 0;
  const points: ChartPoint[] = datesInRange(range).map((date) => {
    const t = byDate.get(date) ?? { total: 0, bills: 0 };
    return {
      key: date,
      label: shortDayLabel(date),
      value: t.total,
      detail: `${dayLabel(date)} · ${rupees(t.total)} · ${billCount(t.bills)}`,
      highlight: date === range.to,
    };
  });

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <ChartFrame
          as="h2"
          title="Last 7 days"
          takeaway={`Today ${rupees(today)} · 7-day total ${rupees(week)}`}
        >
          <Suspense fallback={<Skeleton className="w-full" style={{ height: HEIGHT }} />}>
            <ColumnChart title="Last 7 days" points={points} height={HEIGHT} compact />
          </Suspense>
        </ChartFrame>
        <Link
          to="/reports"
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary-800 underline-offset-4 hover:underline"
        >
          See reports
        </Link>
      </CardBody>
    </Card>
  );
}
```

Check `Skeleton` accepts `style`; if its props do not pass `style` through, use `className="h-24 w-full"` (96 px) instead.

Then delete `BarChart.tsx`, `BarChart.test.tsx`, and `niceMax` (with its test case) from `scale.ts` / `scale.test.ts`.

- [ ] **Step 4: Run all web tests, typecheck and lint, expect PASS**

Run: `pnpm --filter @rpos/web test && pnpm typecheck && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): home week card loads its chart lazily; remove the old bar chart"
```

### Task 7: Bundle check, browser pass, docs

**Files:**
- Modify: `apps/web/ARCHITECTURE.md`

- [ ] **Step 1: Bundle budget.** Run `pnpm --filter @rpos/web build`. Note the entry chunk (`index-*.js`) gzip size: it must be ≤ 260 kB (215 + 45) and within about 1 kB of the 253 kB before this phase. Confirm Recharts is in its own chunk: `grep -l "recharts" apps/web/dist/assets/*.js` lists no `index-*.js`.

- [ ] **Step 2: Browser pass** with demo data (api + web preview servers):
  - Reports → Last 7 days: ticks on round ₹10k steps, tooltip on hover shows "Sun 4 Oct" over "₹26,546 · 35 bills", best day darker, hours area with the peak dot, donut with ₹95,840 in the middle.
  - Custom range covering a month: labels thin out, nothing overlaps.
  - Keyboard: Tab into a chart, arrow keys move the tooltip.
  - Home: card text appears first, chart fills in; today's bar darker.
  - Phone width (375 px) and desktop: no horizontal scroll, donut and legend stack on the phone.
  - Check that `var(--color-…)` fills render (bars not black). If a browser ignores `var()` in SVG presentation attributes, switch the fills to `style={{ fill: 'var(--…)' }}` on `Cell` and re-run the tests.
  - Screenshot before (from `main`) and after for the review.

- [ ] **Step 3: Docs.** In `apps/web/ARCHITECTURE.md` "UI kit", add:

```md
- **Charts** use Recharts and live in `features/reports/charts/` (the only folder allowed to
  import it, so it stays out of the first bundle). Charts take `ChartPoint[]`, draw colours
  from tokens, put the data in a screen-reader list (`ChartData`) and switch animation off
  under reduced motion. Screens in the first bundle load a chart with `lazy()`.
```

- [ ] **Step 4: Full check and commit**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm --filter @rpos/web test`

```bash
git add apps/web/ARCHITECTURE.md
git commit -m "docs(web): charts rule in the UI kit notes"
```

- [ ] **Step 5: Review and merge.** Fresh reviewer (apple-design review of the chart screenshots plus a code review of the branch diff); fix Critical/Important with tests; `git checkout main && git merge --no-ff feat/u5-ui-polish`.
