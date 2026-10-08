# U3b — Sales charts

Part of U3 (setup guide done; this; then faster admin editing; then logo on bills).

## 1. Purpose

The Sales report today is numbers and tables. Owners want to see at a glance: is the week
going up or down, when is the rush, how do people pay, which dishes earn the money. The owner
home shows today's totals but no trend.

**Success looks like:**
- Reports shows four charts above the existing tables: **Sales by day**, **Busiest hours**,
  **How customers paid**, **Top dishes**.
- The owner home's sales card adds a small **Last 7 days** chart that links to Reports.
- Every chart has a title, a one-line takeaway in words (e.g. "Busiest: 1–2 pm, ₹8,400"), a
  hover/focus tooltip on each bar, and the tables below stay as the full data view.
- No chart library: small SVG components on the kit's tokens. Reports stays lazy-loaded.
- Money in charts uses `rupees()` (Indian grouping); short axis labels use `₹12k`/`₹1.2L`.

**Out of scope:** charts on other screens, comparisons with a previous period, exports of
charts, dark mode for charts (Reports and Home are light screens).

## 2. Data

### 2.1 New: sales by hour (API)
`GET /api/reports/sales` gains `hours: { hour: number; bills: number; total: number }[]`:
- Non-void bills of the selected business days, grouped by the hour of `bills.created_at` in
  Asia/Kolkata (`0`–`23`), sorted by hour, only hours with at least one bill.
- `total` in paise as `float8` like the other sums; `bills` as `int`.
- The CSV exports are unchanged.

### 2.2 Existing data used
- Sales by day: `days[]` (`date`, `total`, `bills`).
- Payment mix: `summary.payments` (`CASH`, `UPI`, `CARD`).
- Top dishes: `items[]` (already sorted by amount).
- Home trend: a second sales-report query for the last 7 days ending today (new preset
  `last7Days`).

## 3. Charts

All charts share: a `<figure>` with a heading-level title, the takeaway line under it, and an
SVG with `role="img"` and an `aria-label` that repeats the takeaway. Bars are anchored to the
baseline, 4 px rounded top ends, 2 px gaps between bars, recessive grid (3 lines) and axis text
in `text-subtle`. Values and labels use text colours, never the bar colour.

| Chart | Form | Shown when | Takeaway |
|---|---|---|---|
| Sales by day | Vertical bars, one per business day in range, one hue (`primary-600`), x labels as "Mon 6" (thinned to at most 8 labels) | at least 2 days | "Best day: Sat 11 Oct, ₹18,250" |
| Busiest hours | Vertical bars for every hour from the first to the last hour with sales (gaps shown as empty), one hue, x labels "9am", "12pm", "3pm" every 3 hours | any bills | "Busiest: 1–2 pm, ₹8,400 from 14 bills" |
| How customers paid | One horizontal 100% stacked bar, Cash / UPI / Card in fixed order with the validated colours `#1baf7a` (cash), `#2a78d6` (UPI), `#eb6834` (card), 2 px gaps; legend below with name, amount and percent for each mode (also the direct label) | total paid > 0 | "Most paid by UPI: 62%" |
| Top dishes | Horizontal bars, top 8 `items` by amount, dish name (with size if not "Regular") on the left, amount on the right, one hue | any items | "Top seller: Paneer Tikka, ₹4,400" |
| Last 7 days (home) | Small vertical bars (height 96 px), one slot for each of the 7 dates (a date with no business day shows an empty slot, value ₹0), today's bar `primary-700`, others `primary-300`, no axis, tooltip per bar; link "See reports" | owner (`reports.all`) | "Today ₹12,400 · 7-day total ₹68,900" |

### 3.1 Tooltips
- Each bar has a transparent hit area the full plot height (at least 24 px wide where room
  allows). On pointer enter or keyboard focus the tooltip shows the label and values, e.g.
  "Sat 11 Oct · ₹18,250 · 42 bills". Escape or pointer leave hides it.
- Bars are focusable (`tabIndex=0`) only in the day and hour charts; arrow keys move focus
  between bars of the same chart, so the chart is one Tab stop.
- The payment and dish charts show all values as text already and need no tooltip.

### 3.2 Number formats
`shortRupees(paise)`: below ₹1,000 → "₹850"; below ₹1 lakh → "₹12k" / "₹12.5k"; from ₹1 lakh
→ "₹1.2L"; from ₹1 crore → "₹1.2Cr". One decimal, trailing ".0" dropped. Used on axes only.

### 3.3 Scale
`niceMax(value)` rounds the axis top up to 1, 2, 2.5 or 5 × 10ⁿ paise so grid lines land on
round rupees; three grid lines at ⅓, ⅔ and the top. Zero data → no chart.

## 4. Code

- API `apps/api/src/reports/sales-report.service.ts`: `hours(dayIds)` query, added to the
  response; e2e test in the existing reports e2e file.
- Web `features/reports/`:
  - `types.ts`: `hours` on `SalesReport`.
  - `ranges.ts`: preset `last7Days` (today and the 6 days before, Asia/Kolkata).
  - `charts/scale.ts`: `niceMax`, `shortRupees`, `hourLabel`, `dayLabel`, pure and tested.
  - `charts/BarChart.tsx`: vertical bars with tooltip and keyboard; props
    `{ title, takeaway, bars: { key, label, value, detail, highlight? }[], height?, compact? }`.
  - `charts/PaymentMix.tsx`, `charts/TopDishes.tsx`: the two horizontal charts.
  - `components/SalesCharts.tsx`: picks the charts from a `SalesReport`.
  - `components/WeekTrend.tsx`: the home chart; exported from `features/reports`.
- `pages/ReportsPage.tsx`: `SalesCharts` between the summary cards and the tables.
- `app/home/HomePage.tsx`: `WeekTrend` inside the owner's sales area.

## 5. Tests

- API e2e: two bills at 13:10 and 13:50 IST and one at 19:05 → `hours` = 13 (2 bills) and 19;
  a voided bill does not count; days outside the range do not count.
- `scale.test.ts`: `niceMax` examples (0, 1, 7, 12_340, 99_000, 1_23_456_00), `shortRupees`
  examples across ₹, k, L, Cr, `hourLabel` (0 → "12am", 13 → "1pm"), `dayLabel`.
- `SalesCharts.test.tsx`: renders the four charts with takeaways from a fixture; hides Sales by
  day for a single day; hides all charts when there are no bills; tooltip on focus shows the
  values; arrow keys move between bars; payment legend shows amounts and percents; axe.
- `HomePage.test.tsx`: owner sees "Last 7 days" with the takeaway and a "See reports" link;
  the week query uses the 7-day range.
- Bundle: initial JS within the U1 budget (Reports is lazy).
