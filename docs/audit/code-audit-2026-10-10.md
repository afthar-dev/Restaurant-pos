# Code audit: order-to-report flow (2026-10-10)

Read-only audit of the restaurant POS. It covers the QR order → approval → KOT → kitchen → bill → discount → split/part payment → void/cancel → paid → table freed path; the sales report, day-close report, home dashboard, charts and CSV; day close, cash reconciliation and reopen; and production gaps.

How it was checked: code paths were read end to end in `apps/api` and `apps/web`. The existing e2e specs (`apps/api/test/reports.e2e-spec.ts`, `day-close.e2e-spec.ts`) were reviewed. `pnpm --filter @rpos/api test` was run: 8 suites, 38 tests, all passing. The e2e suites were not run because they need Postgres on 5433.

**Result: 0 Critical, 4 Important, 13 Minor.** Every finding was verified by reading the code path unless it is marked PLAUSIBLE.

---

## Important

### I-1. "Sales today" on Home shows ₹0 after midnight while the business day is still running
- **Where:** `apps/web/src/app/home/HomePage.tsx:26` (`presetRange('today')`), `apps/web/src/features/reports/components/WeekTrend.tsx:22,35`, and the bucketing in `apps/api/src/reports/sales-report.service.ts:23-26` (a business day belongs to the IST date of `opened_at`).
- **Scenario:** The day opens on 10 Oct at 11:00 IST, and ₹40,000 is billed by 23:59. At 00:30 on 11 Oct, while service continues, the owner opens Home. `presetRange('today')` now returns `2026-10-11`. No business day was opened on that date, so "Sales today" shows ₹0 with 0 bills, and the 7-day chart puts "Today ₹0" on the highlighted bar. The open day's sales, including the bill made at 00:30, all sit under 10 Oct. The Day page (`/business-day/:id/report`) shows the full ₹40,000+ at the same moment, so the two screens disagree. The same thing happens when a day is left unclosed overnight.
- **Fix:** Drive the Home "today" tile from the *current open business day* rather than the calendar date. For example, add `?day=current` to the sales report, or use `/business-day/:id/report` for the open day. Fall back to the calendar date only when no day is open. Label the tile with the business day's opening date.

### I-2. Sales totals include unpaid (OPEN) bills, but payment totals do not, so the numbers on one screen don't add up
- **Where:** `apps/api/src/reports/sales-report.service.ts:29` (`status: { not: 'VOID' }` includes OPEN), lines 33-53 (bill totals and per-day totals), lines 54-58 (payments only exist for what was paid). The same rule applies in `day-close.service.ts:174-178` (day list total) and `:208` (day report `live`).
- **Scenario:** During service, 10 bills worth ₹5,000 are printed and 4 of them (₹2,000) are still unpaid. The Reports page and Home show "Sales ₹5,000" and "Bills 10". The Payments split shows Cash + UPI + Card = ₹3,000. The days table row shows Sales ₹5,000 with Cash/UPI/Card adding up to ₹3,000. The donut says "₹3,000 paid". The owner cannot tell whether ₹2,000 is missing or simply not collected yet. After the day closes the numbers agree, because close blocks on OPEN bills. If an OPEN bill is later voided, "Sales today" also drops with no explanation.
- **Fix:** Either count only `PAID` bills as sales and show "Billed, not yet paid: ₹X (n bills)" as a separate line, or keep the current definition and add an explicit "Unpaid" row so Sales = Paid + Unpaid on every screen. Apply the same choice to the sales report, the day report and the day list.

### I-3. The GST summary's "taxable" figure includes No-GST items, and there is no rate-wise breakup to file from
- **Where:** `apps/api/src/billing/bill-calc.ts:117` (`taxable` is computed for every line, including 0% lines), `:130` (the bill's `taxable` sums all lines). The report sums `bill.taxable` in `sales-report.service.ts:41,119` and `day-close.service.ts:270`. Only total CGST/SGST is reported (`SummaryCards.tsx:54-61`). The per-bill `taxBreakupOf` (`bill.views.ts:24-47`) correctly skips 0% rows, but no report aggregates it.
- **Scenario:** One bill has a ₹200 dish at 5% and a ₹100 No-GST item (for example packaged water set to No GST). The bill footer correctly shows a "GST 5%" row with taxable ₹200. The sales and day reports show "Taxable ₹300, CGST ₹5, SGST ₹5". An accountant filing GSTR-1/3B from this report would declare ₹300 as taxable value instead of ₹200 taxable plus ₹100 nil-rated or exempt. An outlet with dishes at more than one rate (5% and 18%) cannot get a taxable value per rate from any report.
- **Fix:** Add a rate-wise aggregation over `bill_items` (`GROUP BY cgst_bp, sgst_bp`, summing `taxable`, `cgst`, `sgst`, live bills only) to the sales report and day report. Show "No-GST sales" as its own row and either rename the current figure to "Net sales before tax" or exclude 0% lines from "Taxable".

### I-4. Home dashboard sales figures never refresh on their own
- **Where:** `apps/web/src/features/reports/queries.ts:7-12` (no `refetchInterval`), `apps/web/src/features/realtime/invalidations.ts:31-36` (`bill.updated` does not invalidate `reportKeys`), and `apps/web/src/shared/api/queryClient.ts:18-20` (no polling default).
- **Scenario:** The owner leaves Home open on a counter tablet or office PC. Bills are printed and paid all evening. "Sales today", "Bills", "Average bill" and the 7-day chart keep the numbers from page load. They update only on window focus or remount. The "Before closing the day" card next to them polls every 15 s (`day/queries.ts:17-22`), so the two cards on the same screen visibly disagree.
- **Fix:** Add `reportKeys` (prefix `['reports']`) to the `bill.updated` and `day.updated` invalidations, and/or give `useSalesReport` a `refetchInterval: POLL_MS` when the range includes today.

---

## Minor

### M-1. "Net" is sales including GST minus expenses
- **Where:** `sales-report.service.ts:128` (`net: total - expenseTotal`), shown as "Net" in `SummaryCards.tsx:31-35`.
- **Scenario:** Sales ₹1,05,000, of which ₹5,000 is GST collected, and expenses of ₹60,000 show "Net ₹45,000". The restaurant actually keeps ₹40,000 before GST remittance. Owners read "Net" as profit.
- **Fix:** Compute net from `total − cgst − sgst − expenses`, or relabel it "Collections minus expenses".

### M-2. "Top items" ranks differently on the day report and on Reports
- **Where:** `day-close.service.ts:239-241` sorts by **quantity**. `sales-report.service.ts:176` and `TopDishes.tsx` sort by **amount**.
- **Scenario:** 40 rotis at ₹20 (₹800) and 5 biryanis at ₹300 (₹1,500) on one day. The printed day report lists Roti first. Reports for the same day says "Top seller: Biryani".
- **Fix:** Pick one ordering, or label each ("Most sold" vs "Top earners").

### M-3. Dish and category tables group by snapshot name, not by item
- **Where:** `sales-report.service.ts:171-176` (`GROUP BY bi.item_name, bi.variant_name`), `:180-192` (category is the dish's *current* category, as the comment there says).
- **Scenario:** "Paneer Tikka" is renamed "Paneer Tikka (Dry)" mid-month, so the monthly report shows two rows and splits the totals. Moving a dish to a new category moves its whole history with it.
- **Fix:** Group items by `order_items.item_id` + `variant_id`, and display the latest name.

### M-4. The "Sales by day" chart shows two bars with the same date label when two business days open on one date
- **Where:** `apps/web/src/features/reports/charts/points.ts:7-19` (one point per business day, labelled by date). `WeekTrend.tsx` merges by date correctly; `SalesCharts` does not.
- **Scenario:** The day is closed after lunch and a new one opened for dinner on 10 Oct. The chart shows "Sat 10" twice, and "Best day" can name a half-day.
- **Fix:** Aggregate `days` by `date` before charting, as WeekTrend does.

### M-5. Payment-mix percentages can add up to 99% or 101%
- **Where:** `apps/web/src/features/reports/charts/PaymentDonut.tsx:23`.
- **Scenario:** Cash ₹1, UPI ₹1, Card ₹1 shows 33% / 33% / 33%. Other splits can round up to a total of 101%.
- **Fix:** Use largest-remainder rounding (the API already has `allocate` in `bill-calc.ts` for the same purpose).

### M-6. Bill, KOT and day-report printouts use the printing device's time zone (PLAUSIBLE)
- **Where:** `apps/web/src/features/printing/templates/billTicket.ts:74`, `kotTicket.ts:33`, `features/day/dayReport.ts:17` (`toLocaleString('en-IN', …)` with no `timeZone`).
- **Scenario:** A POS PC whose Windows time zone is UTC prints a bill made at 00:30 IST on 11 Oct with the date "10 Oct, 7:00 pm". That is a wrong invoice date on a tax document. The server side is fine: it has no local-time usage, and prod compose sets `TZ=Asia/Kolkata`.
- **Fix:** Pass `timeZone: 'Asia/Kolkata'` to every date format used on printed documents.

### M-7. A voided paid bill has no refund record, so cash refunds show up as unexplained drawer variance
- **Where:** `apps/api/src/billing/bills.service.ts:298-305`. Payments stay on the VOID bill and are dropped from every total (`day-close.service.ts:212,336-341`, `sales-report.service.ts:56`).
- **Scenario:** A bill for ₹500 paid by UPI is voided and re-billed at ₹450 after a complaint. The customer is handed ₹50 cash from the drawer, and the new bill is recorded as ₹450 UPI. Expected cash ignores the ₹50 refund, so close shows a −₹50 variance. The day report's "Voided bills" list does not say that the voided bill had been paid, or by which mode.
- **Fix:** Show "paid before void: ₹X (mode)" on voided bills in the day report. Also allow a cash refund or payout entry (or a negative cash expense) that feeds expected cash.

### M-8. QR requests on a BILLED order are listed for approval but cannot be approved
- **Where:** `apps/api/src/qr/qr-approval.service.ts:40` (`pending` includes `BILLED` via `ACTIVE_STATUSES`), `:70-72` (approve throws ORDER_NOT_OPEN when the order is not OPEN).
- **Scenario:** The bill is printed, then the guest orders dessert from the QR. Staff see the request and tap Approve, which fails with "This order is no longer open". The request then stays waiting until the bill is paid and is auto-rejected with "Table closed".
- **Fix:** Tell staff "Void the bill to add these dishes" in the pending card, or allow approval to reopen a BILLED order with no payments.

### M-9. "Average bill" is per bill, so split bills pull it down
- **Where:** `sales-report.service.ts:124`.
- **Scenario:** One table of ₹3,000 is split into 3 bills, giving "Average bill ₹1,000" instead of an average ticket of ₹3,000 for that party. Using `byType.*.orders` would give an average per order.
- **Fix:** Show "Average per order" using the distinct order count, or label the figure clearly.

### M-10. Stock running balance is `Int` thousandths and can overflow for g/ml items (PLAUSIBLE)
- **Where:** `apps/api/prisma/schema.prisma` (`StockItem.currentMilli Int`), `apps/api/src/stock/post-txn.ts:32-35` (`increment`). Each line is validated up to 1,000,000 units (`packages/shared/src/back-office.ts:8,76`), but the running sum is not.
- **Scenario:** Flour tracked in "g", bought as 25,000 g per purchase (25,000,000 milli each), with no counts. About 86 purchases reach 2³¹. After that, Postgres raises "integer out of range" and the next purchase fails with a 500. Two ADJUST entries at the allowed maximum of 1e9 milli overflow right away. This was not reproduced against a live database.
- **Fix:** Make `current_milli` and `qty_milli` `BigInt`, or cap the resulting balance in validation.

### M-11. The KDS keeps showing the original NEW ticket after the order is voided or a dish is cancelled (UX)
- **Where:** `apps/api/src/kots/kots.service.ts:336-345`. The NEW-type KOT stays listed until it is bumped, and the CANCEL ticket is shown separately. `KotLine` has no cancelled flag.
- **Scenario:** A table orders 2 × Dal, then the manager voids the order. The kitchen sees the original "2 × Dal" ticket still in NEW, plus a separate cancel ticket. A busy cook may make the dish anyway.
- **Fix:** Mark KOT lines whose order item is CANCELLED as struck through on the KDS ticket, or auto-close a NEW ticket whose lines are all cancelled.

### M-12. The day report orders bills by `billNo`, which restarts on 1 April
- **Where:** `day-close.service.ts:206` (`orderBy: { billNo: 'asc' }`); the number resets per financial year (`billing/financial-year.ts`, `bills.service.ts:88-89`).
- **Scenario:** A business day runs from 31 Mar 18:00 to 1 Apr 01:00. Bills 4501–4530 and 1–6 for 2027-28 print in the report as 1–6 first, then 4501–4530. Voids and discounts lists are mis-ordered the same way.
- **Fix:** Order by `createdAt`, or by `financialYear, billNo`.

### M-13. A reopened day keeps its original date, so any sales taken after reopening count toward that date
- **Where:** `day-close.service.ts:100-165` (reopen keeps `opened_at`), with bucketing in `sales-report.service.ts:23-26`.
- **Scenario:** The owner reopens yesterday's day at 10:00 to fix a bill, then forgets to close it. The whole of today's service lands under yesterday, and "Sales today" shows ₹0 (see I-1). The previous close figures (expected, counted, variance) are erased from the row; they survive only in the audit log.
- **Fix:** Warn in the reopen dialog and in the DayStatusPill when the open day's date is not today. Optionally show the previous close tally from the audit log on the day report.

---

## Checked and correct

**Order to bill**
- QR submit refuses when no day is open (`qr.service.ts:145`). A pending QR request blocks billing (`bills.service.ts:57-64`). Approval is idempotent per submission and sends exactly one KOT (`qr-approval.service.ts:63,88`). Rejecting the last request on an empty PENDING_APPROVAL order cancels it and frees the table. QR-rejected orders never reach any report because they have no bills.
- Unsent (NEW) items block bill creation, and part billing tracks quantities per order item over non-void bills (`settle.ts:39-46`). Cancel after KOT is refused for quantities already on a bill.
- Bill packaging goes only on the first live parcel bill, and returns to the next bill if the first is voided (`bills.service.ts:90-102`).

**Bill maths** (`bill-calc.ts`, also covered by its spec)
- Amounts are integer paise and half-up per line. Bill discount is allocated pro rata and adds up exactly (largest remainder).
- Discounts are clamped to 0..base. Total is rounded to the rupee and `roundOff` is recorded.
- Gross − discounts + packaging + CGST + SGST + roundOff = total is consistent across bill, day report and sales report.
- No-GST lines produce no "GST 0%" footer row.
- COMPOSITION and NONE schemes charge no tax.

**Discounts and payments**
- Discounts are allowed only on an OPEN bill with no payments. A reason is required, the cashier cap is checked against gross with a manager override, and the change is audited inside the same transaction.
- Payments are refused when they exceed the amount due. Cash stores `amount` (not `tendered`), so change does not inflate cash sales. Payments are idempotent per key and serialised by the order row lock. A ₹0 bill settles at once.
- The table is freed only when the order is BILLED and every live bill is PAID (`settle.ts:26-36`). Cancelling or removing the last unbilled dish re-checks this (`markBilledIfComplete`).

**Void and cancel**
- A bill can be voided only on the open day it belongs to.
- Voiding a bill on a closed order re-takes its table and every merged table under lock, or returns TABLE_BUSY.
- Payments on a void bill are excluded from cash expected, the payment mix and sales. They are counted the same way in the close check, close, day report and sales report.
- Voiding an order requires that no live bill exists. Merging requires that the source table has no live bill and that both orders are on the same day.

**Day close**
- Expected cash = opening + cash payments on non-void bills − non-void CASH expenses (purchases included via their linked expense). This matches the close check, the close itself and the day report, and the stored `expectedCash` is used after close.
- Close takes `FOR UPDATE` on the day row, while every writer (`requireOpen`) takes `FOR SHARE`. Blockers cover PENDING_APPROVAL, OPEN and BILLED orders and OPEN bills. A race test exists (`day-close.e2e-spec.ts:150`).
- Reopen is owner only (`day.reopen`), works only on the latest day and only when no other day is open, requires a reason and is audited. Reports count a reopened day once (e2e test).

**Reports**
- Date bucketing uses `AT TIME ZONE 'Asia/Kolkata'` for both days and the hour chart. The web range presets compute IST dates independently of the device time zone (`ranges.ts`). The busiest-hours chart orders late-night hours after the evening (`serviceHours`).
- Overflow: Prisma `_sum` on Int columns and the raw `SUM(...)::float8` are exact beyond ₹2.15 crore, and an e2e test covers this. There is no `SUM()::int` anywhere.
- Empty states: an empty range returns zeros (e2e test). Charts hide when there are no bills. The donut hides when nothing has been paid.
- CSV export escapes formula injection and includes a BOM for Excel.

**Permissions and production**
- `/reports/sales` requires `reports.all` (owner only). Day list and report require `reports.dayClose`. Close and close-check require `day.openClose`. Every day, bill and expense query is scoped by `outletId`. An override token is single-use, tied to the requester and permission, and the approver must actually hold that permission.
- Indexes exist for every report predicate: `bills(business_day_id,status)`, `payments(business_day_id,mode)`, `bill_items(bill_id)`, `expenses(business_day_id)`, `orders(business_day_id)`, `kots(outlet_id,business_day_id,status)`. `business_days` has no `opened_at` index, but at one row per day that does not matter.
- No N+1 queries in report paths. Ranges are capped at 92 days. List endpoints (audit, purchases, stock txns, day list) are capped at 200 or 90 rows.
- The server has no dependency on local time: financial year and report dates are computed in IST explicitly.
- API unit tests: 38/38 pass.
