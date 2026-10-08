# U3b Sales Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four charts on the Sales report (by day, by hour, payment mix, top dishes) and a "Last 7 days" chart on the owner home, with a small API addition for sales by hour.

**Architecture:** The API's sales report gains `hours` (bills grouped by India hour). The web app gets pure helpers (`charts/scale.ts`), a chart frame, a vertical `BarChart` (HTML bars, roving focus, tooltip), `PaymentMix` and `TopDishes`, assembled by `SalesCharts` on the Reports page and `WeekTrend` on Home. No chart library.

**Tech Stack:** NestJS 11 + Prisma 6 raw SQL (API); React 19, TanStack Query, Tailwind 4 kit (web); Jest + supertest (API e2e), Vitest + Testing Library + vitest-axe (web).

**Spec:** `docs/superpowers/specs/2026-10-08-u3b-sales-charts-design.md`

## Global Constraints

- No chart library. Charts use kit tokens; the payment colours are `#1baf7a` (cash), `#2a78d6` (UPI), `#eb6834` (card) as theme tokens `pay-cash`, `pay-upi`, `pay-card`.
- Money in text and tooltips via `rupees()`; axis labels via `shortRupees()` ("₹850", "₹12k", "₹12.5k", "₹1.2L", "₹2Cr").
- Every chart: title, one-line takeaway, values in text colours (never the bar colour); the existing tables stay below as the data view.
- Day and hour charts: bars focusable with roving tabindex (one Tab stop), arrow keys move, tooltip on hover and focus, Escape hides.
- `hours`: non-void bills of the selected business days, grouped by hour of `bills.created_at` in Asia/Kolkata, sorted, only hours with bills; `total` float8 paise, `bills` int. CSV exports unchanged.
- Reports stays lazy-loaded; initial JS stays within the U1 budget (≤ 45 kB gzip over 215 kB).
- Commands: web from `apps/web` (`npx vitest run <path>`, `npx tsc --noEmit -p tsconfig.json`); API e2e from `apps/api` (`pnpm test:e2e -- reports`); lint from the root (`pnpm lint`).

## Review Focus

1. A range with bills but only one business day → no "Sales by day" chart (one bar says nothing), other charts still show.
2. Hours with no bills between the first and last busy hour → empty slots, not missing bars (the x-axis must stay continuous).
3. A void bill, or a bill on a day outside the range → not counted in `hours`.
4. Home: a date in the last 7 days with no business day (closed) → an empty slot for that date; two business days on one date → summed.
5. Payment mix with one mode at ₹0 → no zero-width segment, legend still lists it with ₹0 and 0%.

Each is pinned by a test in Tasks 1, 3, 4 or 5.

---

### Task 1: Sales by hour in the API

**Files:**
- Modify: `apps/api/src/reports/sales-report.service.ts`
- Test: `apps/api/test/reports.e2e-spec.ts`
- Modify: `apps/web/src/features/reports/types.ts` (`hours` on `SalesReport`)
- Modify: `apps/web/src/app/home/HomePage.test.tsx`, `apps/web/src/features/reports/pages/ReportsPage.test.tsx` (fixtures gain `hours: []`)

**Interfaces:**
- Produces: response field `hours: { hour: number; bills: number; total: number }[]`; web `SalesReport['hours']` of the same type.

- [ ] **Step 1: Write the failing e2e test**

Add to `reports.e2e-spec.ts` (inside `describe('sales report')`), and add `parcelOrder` is already imported from `./billing-helpers`:

```ts
  it('groups bills by the India hour they were made, leaving out void bills', async () => {
    await openDay();
    const roti = [{ variantId: r.roti.regular.id, quantity: 1 }];
    const a = await billFor(roti);
    const b = await billFor([{ variantId: r.roti.regular.id, quantity: 2 }], r.t2.id);
    const parcelBill = async () => {
      const orderId = await parcelOrder(ctx, waiter, roti);
      return (
        await ctx
          .http()
          .post(`/api/orders/${orderId}/bills`)
          .set(cashier.auth)
          .send({})
          .expect(201)
      ).body as { id: string; total: number };
    };
    const c = await parcelBill();
    const voided = await parcelBill();
    const at = (hh: number, mm: number) =>
      new Date(`${istDate(0)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`);
    await ctx.prisma.bill.update({ where: { id: a.id }, data: { createdAt: at(13, 10) } });
    await ctx.prisma.bill.update({ where: { id: b.id }, data: { createdAt: at(13, 50) } });
    await ctx.prisma.bill.update({ where: { id: c.id }, data: { createdAt: at(19, 5) } });
    await ctx.prisma.bill.update({
      where: { id: voided.id },
      data: { createdAt: at(13, 30), status: 'VOID' },
    });

    const res = await report(istDate(0), istDate(0)).expect(200);
    expect(res.body.hours).toEqual([
      { hour: 13, bills: 2, total: a.total + b.total },
      { hour: 19, bills: 1, total: c.total },
    ]);
    const empty = await report('2020-01-01', '2020-01-31').expect(200);
    expect(empty.body.hours).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run (from `apps/api`): `pnpm test:e2e -- reports`
Expected: FAIL — `hours` is `undefined`.

- [ ] **Step 3: Implement**

In `sales-report.service.ts` add the query next to `items`/`categories`:

```ts
  /** Bills by the India hour they were made, for the busiest-hours chart. */
  private async hours(dayIds: string[]) {
    if (dayIds.length === 0) return [];
    return this.prisma.$queryRaw<{ hour: number; bills: number; total: number }[]>`
      SELECT EXTRACT(HOUR FROM b.created_at AT TIME ZONE ${TIME_ZONE})::int AS hour,
             COUNT(*)::int AS bills, COALESCE(SUM(b.total), 0)::float8 AS total
        FROM bills b
       WHERE b.business_day_id IN (${this.ids(dayIds)}) AND b.status <> 'VOID'
       GROUP BY 1
       ORDER BY 1`;
  }
```

and in the returned object, after `categories: await this.categories(dayIds),` add `hours: await this.hours(dayIds),`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:e2e -- reports`
Expected: PASS (all sales report tests).

- [ ] **Step 5: Web type and fixtures**

`apps/web/src/features/reports/types.ts` — add to `SalesReport` after `categories`:

```ts
  /** Bills by India hour (0–23), only hours with bills. */
  hours: { hour: number; bills: number; total: number }[];
```

Then run `npx tsc --noEmit -p tsconfig.json` in `apps/web` and add `hours: []` to every `SalesReport` fixture it reports (the `SALES` constant in `HomePage.test.tsx` and the report fixtures in `ReportsPage.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add apps/api apps/web/src
git commit -m "feat(api): sales by hour in the sales report"
```

---

### Task 2: Chart helpers and the 7-day range

**Files:**
- Create: `apps/web/src/features/reports/charts/scale.ts`
- Test: `apps/web/src/features/reports/charts/scale.test.ts`
- Modify: `apps/web/src/features/reports/ranges.ts`
- Test: `apps/web/src/features/reports/helpers.test.ts` (add cases)

**Interfaces:**
- Produces: `niceMax(value: number): number`; `shortRupees(paise: number): string`; `hourLabel(hour: number): string`; `hourRange(hour: number): string`; `dayLabel(iso: string): string` ("Sun 11 Oct"); `shortDayLabel(iso: string): string` ("Sun 11"); `billCount(n: number): string` ("1 bill" / "3 bills"); preset `'last7Days'` in `Preset` with label "Last 7 days"; `datesInRange(range: DateRange): string[]`.

- [ ] **Step 1: Write the failing tests**

`scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  billCount,
  dayLabel,
  hourLabel,
  hourRange,
  niceMax,
  shortDayLabel,
  shortRupees,
} from './scale';

describe('chart scale', () => {
  it('rounds the axis top up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect([0, 1, 7, 250, 12_340, 99_000, 12_345_600].map(niceMax)).toEqual([
      0, 1, 10, 250, 20_000, 100_000, 20_000_000,
    ]);
  });

  it('writes short rupee amounts for axes', () => {
    expect(
      [0, 85_000, 1_200_000, 1_250_000, 12_000_000, 250_000_000, 2_000_000_000].map(shortRupees),
    ).toEqual(['₹0', '₹850', '₹12k', '₹12.5k', '₹1.2L', '₹25L', '₹2Cr']);
  });

  it('names hours and days', () => {
    expect([0, 9, 12, 13, 23].map(hourLabel)).toEqual(['12am', '9am', '12pm', '1pm', '11pm']);
    expect(hourRange(13)).toBe('1pm–2pm');
    expect(hourRange(23)).toBe('11pm–12am');
    expect(dayLabel('2026-10-11')).toBe('Sun 11 Oct');
    expect(shortDayLabel('2026-10-11')).toBe('Sun 11');
    expect([1, 3].map(billCount)).toEqual(['1 bill', '3 bills']);
  });
});
```

Append to `helpers.test.ts` (import `datesInRange`, `presetRange` from `./ranges` if not already):

```ts
describe('last 7 days', () => {
  it('runs from six days ago to today in India', () => {
    // 06:00 UTC on 8 Oct is 11:30 in India.
    expect(presetRange('last7Days', Date.UTC(2026, 9, 8, 6, 0))).toEqual({
      from: '2026-10-02',
      to: '2026-10-08',
    });
  });

  it('lists every date in a range', () => {
    expect(datesInRange({ from: '2026-09-29', to: '2026-10-02' })).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/reports/charts src/features/reports/helpers.test.ts`
Expected: FAIL — `./scale` missing, `last7Days`/`datesInRange` unknown.

- [ ] **Step 3: Implement `scale.ts`**

```ts
/** Axis top: the value rounded up to 1, 2, 2.5 or 5 × 10ⁿ, so grid lines fall on round amounts. */
export function niceMax(value: number): number {
  if (value <= 0) return 0;
  const base = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5]) if (step * base >= value) return step * base;
  return 10 * base;
}

const oneDecimal = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

/** Short money for axes: ₹850, ₹12k, ₹12.5k, ₹1.2L, ₹2Cr. */
export function shortRupees(paise: number): string {
  const r = paise / 100;
  if (r < 1000) return `₹${Math.round(r)}`;
  if (r < 100_000) return `₹${oneDecimal(r / 1000)}k`;
  if (r < 10_000_000) return `₹${oneDecimal(r / 100_000)}L`;
  return `₹${oneDecimal(r / 10_000_000)}Cr`;
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

export const hourRange = (hour: number) => `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "Sun 11 Oct" for an India date (YYYY-MM-DD). */
export function dayLabel(iso: string): string {
  const d = utc(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Sun 11" for axis labels. */
export function shortDayLabel(iso: string): string {
  const d = utc(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export const billCount = (n: number) => (n === 1 ? '1 bill' : `${n} bills`);
```

- [ ] **Step 4: Extend `ranges.ts`**

- `Preset` becomes `'today' | 'yesterday' | 'last7Days' | 'thisWeek' | 'thisMonth' | 'lastMonth'`.
- `PRESET_LABEL` gains `last7Days: 'Last 7 days',` after `yesterday`.
- In `presetRange` add:

```ts
    case 'last7Days':
      return { from: iso(new Date(today.getTime() - 6 * DAY_MS)), to: iso(today) };
```

- Add:

```ts
/** Every India date from `range.from` to `range.to`, inclusive. */
export function datesInRange(range: DateRange): string[] {
  const dates: string[] = [];
  for (
    let t = Date.parse(`${range.from}T00:00:00Z`);
    t <= Date.parse(`${range.to}T00:00:00Z`);
    t += DAY_MS
  ) {
    dates.push(iso(new Date(t)));
  }
  return dates;
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/features/reports`
Expected: PASS. If a `RangePicker` test lists the preset buttons exactly, add "Last 7 days" to it.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/reports
git commit -m "feat(web): chart scale helpers and a last-7-days range"
```

---

### Task 3: Bar chart

**Files:**
- Create: `apps/web/src/features/reports/charts/ChartFrame.tsx`
- Create: `apps/web/src/features/reports/charts/BarChart.tsx`
- Test: `apps/web/src/features/reports/charts/BarChart.test.tsx`

**Interfaces:**
- Consumes: `niceMax`, `shortRupees` (Task 2).
- Produces:
  - `ChartFrame({ title, takeaway, as, children }: { title: string; takeaway: string; as?: 'h2' | 'h3'; children: ReactNode })`
  - `interface Bar { key: string; label: string; value: number; detail: string; highlight?: boolean }`
  - `BarChart(props: { title: string; takeaway: string; bars: Bar[]; height?: number; compact?: boolean; as?: 'h2' | 'h3' })`

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import { BarChart, type Bar } from './BarChart';

const BARS: Bar[] = [
  { key: 'a', label: '1pm', value: 840_000, detail: '1pm–2pm · ₹8,400 · 14 bills' },
  { key: 'b', label: '', value: 0, detail: '2pm–3pm · ₹0 · 0 bills' },
  { key: 'c', label: '', value: 150_000, detail: '3pm–4pm · ₹1,500 · 3 bills' },
];

const renderChart = () =>
  render(<BarChart title="Busiest hours" takeaway="Busiest: 1pm–2pm" bars={BARS} />);

describe('BarChart', () => {
  it('names the chart and every bar', () => {
    renderChart();
    expect(screen.getByRole('heading', { level: 3, name: 'Busiest hours' })).toBeInTheDocument();
    expect(screen.getByText('Busiest: 1pm–2pm')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Busiest hours. Busiest: 1pm–2pm' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('is one tab stop and moves between bars with the arrow keys', () => {
    renderChart();
    const [first, second] = screen.getAllByRole('img');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(second!, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
  });

  it('shows the tooltip on focus and hover, and hides it on Escape', () => {
    renderChart();
    const [first, , third] = screen.getAllByRole('img');
    fireEvent.focus(first!);
    expect(screen.getByText('1pm–2pm · ₹8,400 · 14 bills')).toBeInTheDocument();
    fireEvent.keyDown(first!, { key: 'Escape' });
    expect(screen.queryByText('1pm–2pm · ₹8,400 · 14 bills')).toBeNull();
    fireEvent.mouseEnter(third!);
    expect(screen.getByText('3pm–4pm · ₹1,500 · 3 bills')).toBeInTheDocument();
    fireEvent.mouseLeave(third!);
    expect(screen.queryByText('3pm–4pm · ₹1,500 · 3 bills')).toBeNull();
  });

  it('scales bars to a round axis top and labels the axis', () => {
    renderChart();
    // Highest ₹8,400 → axis top ₹10k.
    expect(screen.getByText('₹10k')).toBeInTheDocument();
    const fills = document.querySelectorAll('[data-bar-fill]');
    expect((fills[0] as HTMLElement).style.height).toBe('84%');
    expect((fills[1] as HTMLElement).style.height).toBe('0%');
  });

  it('has no accessibility problems', async () => {
    renderChart();
    await expectNoAxeViolations();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/reports/charts/BarChart.test.tsx`
Expected: FAIL — `./BarChart` missing.

- [ ] **Step 3: `ChartFrame.tsx`**

```tsx
import type { ReactNode } from 'react';

/** Title and one-line takeaway above a chart. */
export function ChartFrame({
  title,
  takeaway,
  as: Heading = 'h3',
  children,
}: {
  title: string;
  takeaway: string;
  as?: 'h2' | 'h3';
  children: ReactNode;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex flex-col gap-0.5">
        <Heading className="font-semibold text-text">{title}</Heading>
        <p className="text-sm text-muted">{takeaway}</p>
      </figcaption>
      {children}
    </figure>
  );
}
```

- [ ] **Step 4: `BarChart.tsx`**

```tsx
import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { ChartFrame } from './ChartFrame';
import { niceMax, shortRupees } from './scale';

export interface Bar {
  key: string;
  /** Axis label; empty for bars whose label is thinned out. */
  label: string;
  /** Paise. */
  value: number;
  /** Tooltip and accessible name, e.g. "Sat 10 Oct · ₹18,250 · 42 bills". */
  detail: string;
  highlight?: boolean;
}

const GRID = [1 / 3, 2 / 3, 1];

/**
 * Vertical bars anchored to the baseline. One Tab stop: arrow keys move between bars, each
 * bar shows its detail on hover or focus. `compact` drops the axes for small cards.
 */
export function BarChart({
  title,
  takeaway,
  bars,
  height = 176,
  compact = false,
  as,
}: {
  title: string;
  takeaway: string;
  bars: Bar[];
  height?: number;
  compact?: boolean;
  as?: 'h2' | 'h3';
}) {
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState<number | null>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setShown(null);
      return;
    }
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = Math.min(bars.length - 1, Math.max(0, active + step));
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <ChartFrame title={title} takeaway={takeaway} as={as}>
      <div className="flex gap-2">
        {!compact && (
          <div
            aria-hidden="true"
            className="relative w-11 shrink-0 text-right text-xs text-subtle tabular-nums"
            style={{ height }}
          >
            {GRID.map((f) => (
              <span
                key={f}
                className="absolute right-0 translate-y-1/2"
                style={{ bottom: `${f * 100}%` }}
              >
                {shortRupees(max * f)}
              </span>
            ))}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="relative" style={{ height }}>
            {!compact &&
              GRID.map((f) => (
                <div
                  key={f}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-border"
                  style={{ bottom: `${f * 100}%` }}
                />
              ))}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 border-t border-border-strong"
            />
            <div
              role="group"
              aria-label={`${title}. ${takeaway}`}
              onKeyDown={onKeyDown}
              className="absolute inset-0 flex items-end gap-0.5"
            >
              {bars.map((bar, i) => (
                <div
                  key={bar.key}
                  ref={(node) => {
                    refs.current[i] = node;
                  }}
                  role="img"
                  aria-label={bar.detail}
                  tabIndex={i === active ? 0 : -1}
                  onFocus={() => {
                    setActive(i);
                    setShown(i);
                  }}
                  onBlur={() => setShown(null)}
                  onMouseEnter={() => setShown(i)}
                  onMouseLeave={() => setShown(null)}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                  <div
                    data-bar-fill
                    className={cn(
                      'w-full max-w-10 rounded-t transition-colors group-hover:bg-primary-800',
                      bar.highlight ? 'bg-primary-700' : compact ? 'bg-primary-300' : 'bg-primary-600',
                    )}
                    style={{ height: max === 0 ? '0%' : `${Math.round((bar.value / max) * 100)}%` }}
                  />
                  {shown === i && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-56 rounded-md bg-text px-2 py-1 text-xs text-surface shadow-overlay"
                    >
                      {bar.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {!compact && (
            <div aria-hidden="true" className="flex gap-0.5 text-xs text-subtle">
              {bars.map((bar) => (
                <span key={bar.key} className="min-w-0 flex-1 truncate text-center">
                  {bar.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </ChartFrame>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/features/reports/charts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/reports/charts
git commit -m "feat(web): accessible bar chart with tooltips and arrow-key focus"
```

---

### Task 4: Charts on the Sales report

**Files:**
- Modify: `apps/web/src/app/index.css` (payment colour tokens)
- Create: `apps/web/src/features/reports/charts/PaymentMix.tsx`
- Create: `apps/web/src/features/reports/charts/TopDishes.tsx`
- Create: `apps/web/src/features/reports/components/SalesCharts.tsx`
- Modify: `apps/web/src/features/reports/pages/ReportsPage.tsx`
- Test: `apps/web/src/features/reports/components/SalesCharts.test.tsx`

**Interfaces:**
- Consumes: `BarChart`, `Bar`, `ChartFrame` (Task 3); `dayLabel`, `shortDayLabel`, `hourLabel`, `hourRange`, `billCount` (Task 2); `SalesReport` (Task 1).
- Produces: `PaymentMix({ payments })`, `TopDishes({ items })`, `SalesCharts({ report }: { report: SalesReport })`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '@/test/a11y';
import type { SalesReport } from '../types';
import { SalesCharts } from './SalesCharts';

const SUMMARY: SalesReport['summary'] = {
  bills: 17,
  grossSubtotal: 0,
  discounts: 0,
  packaging: 0,
  taxable: 0,
  cgst: 0,
  sgst: 0,
  roundOff: 0,
  total: 2_825_000,
  averageBill: 0,
  payments: { CASH: 500_000, UPI: 1_000_000, CARD: 0 },
  byType: { DINE_IN: { orders: 0, total: 0 }, PARCEL: { orders: 0, total: 0 } },
  expenses: { total: 0, byCategory: [] },
  net: 0,
};

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

const REPORT: SalesReport = {
  range: { from: '2026-10-09', to: '2026-10-10' },
  days: [day('d1', '2026-10-09', 1_000_000, 7), day('d2', '2026-10-10', 1_825_000, 10)],
  summary: SUMMARY,
  items: [
    { itemName: 'Paneer Tikka', variantName: 'Regular', quantity: 20, amount: 440_000 },
    { itemName: 'Biryani', variantName: 'Half', quantity: 5, amount: 150_000 },
  ],
  categories: [],
  hours: [
    { hour: 13, bills: 14, total: 840_000 },
    { hour: 15, bills: 3, total: 150_000 },
  ],
};

describe('SalesCharts', () => {
  it('shows the four charts with a takeaway each', () => {
    render(<SalesCharts report={REPORT} />);
    expect(screen.getByRole('heading', { level: 2, name: 'At a glance' })).toBeInTheDocument();
    expect(screen.getByText('Best day: Sat 10 Oct, ₹18,250')).toBeInTheDocument();
    expect(screen.getByText('Busiest: 1pm–2pm, ₹8,400 from 14 bills')).toBeInTheDocument();
    expect(screen.getByText('Most paid by UPI: 67%')).toBeInTheDocument();
    expect(screen.getByText('Top seller: Paneer Tikka, ₹4,400')).toBeInTheDocument();
  });

  it('keeps the hours continuous, with empty hours as empty bars', () => {
    render(<SalesCharts report={REPORT} />);
    const hours = within(screen.getByRole('group', { name: /^Busiest hours/ }));
    expect(hours.getAllByRole('img').map((b) => b.getAttribute('aria-label'))).toEqual([
      '1pm–2pm · ₹8,400 · 14 bills',
      '2pm–3pm · ₹0 · 0 bills',
      '3pm–4pm · ₹1,500 · 3 bills',
    ]);
  });

  it('lists every payment mode, skipping the empty segment', () => {
    render(<SalesCharts report={REPORT} />);
    const legend = within(screen.getByRole('list', { name: 'Payment modes' }));
    expect(legend.getByText('Card').closest('li')).toHaveTextContent('Card₹00%');
    expect(legend.getByText('Cash').closest('li')).toHaveTextContent('Cash₹5,00033%');
    expect(screen.getByRole('img', { name: 'Cash ₹5,000 (33%), UPI ₹10,000 (67%), Card ₹0 (0%)' }).children).toHaveLength(2);
  });

  it('names dishes with their size when it is not Regular', () => {
    render(<SalesCharts report={REPORT} />);
    expect(screen.getByText('Biryani (Half)')).toBeInTheDocument();
  });

  it('leaves out Sales by day for a single day, and everything without bills', () => {
    const { rerender } = render(
      <SalesCharts report={{ ...REPORT, days: [REPORT.days[1]!] }} />,
    );
    expect(screen.queryByRole('heading', { name: 'Sales by day' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Busiest hours' })).toBeInTheDocument();
    rerender(
      <SalesCharts
        report={{ ...REPORT, summary: { ...SUMMARY, bills: 0 }, hours: [], items: [] }}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'At a glance' })).toBeNull();
  });

  it('has no accessibility problems', async () => {
    render(<SalesCharts report={REPORT} />);
    fireEvent.focus(screen.getAllByRole('img')[0]!);
    await expectNoAxeViolations();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/reports/components/SalesCharts.test.tsx`
Expected: FAIL — `./SalesCharts` missing.

- [ ] **Step 3: Colour tokens**

In `apps/web/src/app/index.css`, inside `@theme`, right after `--color-primary-900: #7c2d12;`:

```css
  /* Payment-mix chart: validated categorical palette (U3b spec). */
  --color-pay-cash: #1baf7a;
  --color-pay-upi: #2a78d6;
  --color-pay-card: #eb6834;
```

- [ ] **Step 4: `PaymentMix.tsx`**

```tsx
import { cn } from '@/shared/lib/cn';
import { rupees } from '@/shared/lib/money';
import { ChartFrame } from './ChartFrame';

const MODES = [
  { key: 'CASH', label: 'Cash', swatch: 'bg-pay-cash' },
  { key: 'UPI', label: 'UPI', swatch: 'bg-pay-upi' },
  { key: 'CARD', label: 'Card', swatch: 'bg-pay-card' },
] as const;

type Payments = Record<(typeof MODES)[number]['key'], number>;

/** One 100% bar of cash, UPI and card, with every amount and share written out. */
export function PaymentMix({ payments }: { payments: Payments }) {
  const total = payments.CASH + payments.UPI + payments.CARD;
  if (total <= 0) return null;
  const rows = MODES.map((m) => ({
    ...m,
    amount: payments[m.key],
    percent: Math.round((payments[m.key] / total) * 100),
  }));
  const top = rows.reduce((a, b) => (b.amount > a.amount ? b : a));
  const summary = rows.map((r) => `${r.label} ${rupees(r.amount)} (${r.percent}%)`).join(', ');

  return (
    <ChartFrame title="How customers paid" takeaway={`Most paid by ${top.label}: ${top.percent}%`}>
      <div role="img" aria-label={summary} className="flex h-6 gap-0.5 overflow-hidden rounded-md">
        {rows
          .filter((r) => r.amount > 0)
          .map((r) => (
            <div key={r.key} className={r.swatch} style={{ flexGrow: r.amount, flexBasis: 0 }} />
          ))}
      </div>
      <ul aria-label="Payment modes" className="flex flex-col gap-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-sm', r.swatch)} />
            <span className="flex-1 text-text">{r.label}</span>
            <span className="font-medium tabular-nums">{rupees(r.amount)}</span>
            <span className="w-10 text-right text-muted tabular-nums">{`${r.percent}%`}</span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
```

- [ ] **Step 5: `TopDishes.tsx`**

```tsx
import { rupees } from '@/shared/lib/money';
import type { SalesReport } from '../types';
import { ChartFrame } from './ChartFrame';

type Item = SalesReport['items'][number];

const dishName = (i: Item) =>
  i.variantName && i.variantName !== 'Regular' ? `${i.itemName} (${i.variantName})` : i.itemName;

/** The eight dishes that earned most, longest bar first. */
export function TopDishes({ items }: { items: Item[] }) {
  const top = items.slice(0, 8);
  if (top.length === 0) return null;
  const max = Math.max(...top.map((i) => i.amount));
  return (
    <ChartFrame
      title="Top dishes"
      takeaway={`Top seller: ${dishName(top[0]!)}, ${rupees(top[0]!.amount)}`}
    >
      <ol className="flex flex-col gap-2">
        {top.map((i) => (
          <li
            key={`${i.itemName}-${i.variantName}`}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate text-text">{dishName(i)}</span>
            <span aria-hidden="true" className="h-2.5 rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-primary-600"
                style={{ width: `${max > 0 ? Math.round((i.amount / max) * 100) : 0}%` }}
              />
            </span>
            <span className="font-medium tabular-nums">{rupees(i.amount)}</span>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}
```

- [ ] **Step 6: `SalesCharts.tsx`**

```tsx
import { useId } from 'react';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody } from '@/shared/ui';
import { BarChart, type Bar } from '../charts/BarChart';
import { PaymentMix } from '../charts/PaymentMix';
import { billCount, dayLabel, hourLabel, hourRange, shortDayLabel } from '../charts/scale';
import { TopDishes } from '../charts/TopDishes';
import type { SalesReport } from '../types';

function dayBars(days: SalesReport['days']): Bar[] {
  const every = Math.ceil(days.length / 8);
  return days.map((d, i) => ({
    key: d.dayId,
    label: i % every === 0 ? shortDayLabel(d.date) : '',
    value: d.total,
    detail: `${dayLabel(d.date)} · ${rupees(d.total)} · ${billCount(d.bills)}`,
  }));
}

/** Every hour from the first to the last with sales, so quiet hours show as gaps. */
function hourBars(hours: SalesReport['hours']): Bar[] {
  const first = hours[0]!.hour;
  const last = hours[hours.length - 1]!.hour;
  const bars: Bar[] = [];
  for (let h = first; h <= last; h++) {
    const row = hours.find((x) => x.hour === h);
    const total = row?.total ?? 0;
    const bills = row?.bills ?? 0;
    bars.push({
      key: String(h),
      label: h % 3 === 0 || h === first ? hourLabel(h) : '',
      value: total,
      detail: `${hourRange(h)} · ${rupees(total)} · ${billCount(bills)}`,
    });
  }
  return bars;
}

const most = <T,>(rows: T[], value: (row: T) => number) =>
  rows.reduce((a, b) => (value(b) > value(a) ? b : a));

/** The report's charts; the tables below stay the full data. */
export function SalesCharts({ report }: { report: SalesReport }) {
  const id = useId();
  const { days, hours, items, summary } = report;
  if (summary.bills === 0) return null;
  const paid = summary.payments.CASH + summary.payments.UPI + summary.payments.CARD;
  const bestDay = days.length >= 2 ? most(days, (d) => d.total) : null;
  const peak = hours.length > 0 ? most(hours, (h) => h.total) : null;

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        At a glance
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {bestDay && (
          <Card>
            <CardBody>
              <BarChart
                title="Sales by day"
                takeaway={`Best day: ${dayLabel(bestDay.date)}, ${rupees(bestDay.total)}`}
                bars={dayBars(days)}
              />
            </CardBody>
          </Card>
        )}
        {peak && (
          <Card>
            <CardBody>
              <BarChart
                title="Busiest hours"
                takeaway={`Busiest: ${hourRange(peak.hour)}, ${rupees(peak.total)} from ${billCount(peak.bills)}`}
                bars={hourBars(hours)}
              />
            </CardBody>
          </Card>
        )}
        {paid > 0 && (
          <Card>
            <CardBody>
              <PaymentMix payments={summary.payments} />
            </CardBody>
          </Card>
        )}
        {items.length > 0 && (
          <Card>
            <CardBody>
              <TopDishes items={items} />
            </CardBody>
          </Card>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Reports page**

In `ReportsPage.tsx` import `SalesCharts` from `../components/SalesCharts` and render it as the first child of the non-empty branch, before `<h2 className="text-lg font-semibold">Days</h2>`:

```tsx
            <>
              <SalesCharts report={data} />
              <h2 className="text-lg font-semibold">Days</h2>
```

- [ ] **Step 8: Run the reports tests**

Run: `npx vitest run src/features/reports`
Expected: PASS. If a `ReportsPage` test now finds two elements for a text that appears in both a chart and a table (e.g. a dish name), scope that query with `within(screen.getByRole('table', …))`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): sales by day, busiest hours, payment mix and top dishes charts"
```

---

### Task 5: Last 7 days on the owner home

**Files:**
- Create: `apps/web/src/features/reports/components/WeekTrend.tsx`
- Modify: `apps/web/src/features/reports/index.ts` (export `WeekTrend`)
- Modify: `apps/web/src/app/home/HomePage.tsx`
- Test: `apps/web/src/app/home/HomePage.test.tsx`

**Interfaces:**
- Consumes: `BarChart` (Task 3); `presetRange('last7Days')`, `datesInRange`, `dayLabel`, `shortDayLabel`, `billCount` (Task 2); `useSalesReport`.
- Produces: `WeekTrend()`.

- [ ] **Step 1: Write the failing test**

Add to `HomePage.test.tsx`:

```tsx
  it('shows the owner the last 7 days with empty slots for closed days', async () => {
    useSession.getState().setSession(sessionBody('OWNER', ['reports.all'], 'Asha'));
    const to = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const shift = (n: number) =>
      new Date(Date.parse(`${to}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
    const week = {
      ...SALES,
      days: [
        { dayId: 'a', date: shift(1), status: 'CLOSED', bills: 4, total: 200_000, cash: 0, upi: 0, card: 0, expenses: 0 },
        { dayId: 'b', date: to, status: 'OPEN', bills: 2, total: 100_000, cash: 0, upi: 0, card: 0, expenses: 0 },
        { dayId: 'c', date: to, status: 'CLOSED', bills: 1, total: 50_000, cash: 0, upi: 0, card: 0, expenses: 0 },
      ],
    };
    const mock = mockApi({
      'GET /api/business-day/current': () => json(DAY_OPEN),
      'GET /api/reports/sales': () => json(week),
    });
    renderRoute('/');
    expect(await screen.findByRole('heading', { level: 2, name: 'Last 7 days' })).toBeVisible();
    expect(screen.getByText('Today ₹1,500 · 7-day total ₹3,500')).toBeInTheDocument();
    const bars = within(screen.getByRole('group', { name: /^Last 7 days/ })).getAllByRole('img');
    expect(bars).toHaveLength(7);
    expect(bars[5]).toHaveAccessibleName(expect.stringContaining('₹2,000 · 4 bills'));
    expect(bars[4]).toHaveAccessibleName(expect.stringContaining('₹0 · 0 bills'));
    expect(screen.getByRole('link', { name: 'See reports' })).toHaveAttribute('href', '/reports');
    const weekCall = callsTo(mock, 'GET', '/api/reports/sales').find(([url]) =>
      String(url).includes(`from=${shift(6)}`),
    );
    expect(weekCall).toBeDefined();
  });
```

(`within` is already imported in that file; if not, add it to the `@testing-library/react` import.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/home`
Expected: FAIL — no "Last 7 days" heading.

- [ ] **Step 3: `WeekTrend.tsx`**

```tsx
import { Link } from 'react-router';
import { rupees } from '@/shared/lib/money';
import { Card, CardBody, Skeleton } from '@/shared/ui';
import { BarChart } from '../charts/BarChart';
import { billCount, dayLabel, shortDayLabel } from '../charts/scale';
import { useSalesReport } from '../queries';
import { datesInRange, presetRange } from '../ranges';

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

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <BarChart
          as="h2"
          title="Last 7 days"
          takeaway={`Today ${rupees(today)} · 7-day total ${rupees(week)}`}
          height={96}
          compact
          bars={datesInRange(range).map((date) => {
            const t = byDate.get(date) ?? { total: 0, bills: 0 };
            return {
              key: date,
              label: shortDayLabel(date),
              value: t.total,
              detail: `${dayLabel(date)} · ${rupees(t.total)} · ${billCount(t.bills)}`,
              highlight: date === range.to,
            };
          })}
        />
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

Add to `features/reports/index.ts`: `export { WeekTrend } from './components/WeekTrend';`

- [ ] **Step 4: Home**

In `HomePage.tsx` import `WeekTrend` from `@/features/reports` (same import line as `useSalesReport`/`presetRange` if present) and render `{canSales && <WeekTrend />}` right after `{canSales && <SalesToday />}`.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/app`
Expected: PASS. The existing owner home test mocks `/api/reports/sales` with one fixture for both queries; it still passes because `SALES.days` is empty.

- [ ] **Step 6: Full checks, bundle and commit**

Run `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, `pnpm lint` (root), and `npx vite build` in `apps/web`: note the gzip size of the `index-*.js` chunk; it must stay ≤ 260 kB (215 kB baseline + 45 kB).

```bash
git add apps/web/src
git commit -m "feat(web): last 7 days chart on the owner home"
```

---

### Task 6: Real-app check

- [ ] **Step 1:** With api and web running and the dev owner signed in, open Reports (Today and Last 7 days) and Home. Check the charts read sensibly with the dev data, tooltips appear on hover and keyboard focus, nothing overflows at 375 px and 1366 px.
- [ ] **Step 2:** Commit any fix with a message naming it.
