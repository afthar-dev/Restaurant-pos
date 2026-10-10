# Audit report: customer order to owner reports

Date: 10 Oct 2026. Scope: the whole flow, from a customer's QR order to payment, day close and the
owner's reports and analytics. Detailed code findings: `code-audit-2026-10-10.md` (same folder).

## Verdict

**The ordering and payment flow works end to end.** No Critical issues were found, and no money is
miscounted in the database. Four Important issues made the owner's numbers misleading on screen.
All four are now fixed and tested. Five smaller issues are also fixed. Nine minor issues remain,
and none of them blocks running the restaurant.

## How it was checked

1. **Live walk-through in the app** at phone size and on desktop, as the demo manager, with real
   clicks:
   - Customer QR menu on the Wi-Fi address → add dish → place order.
   - Staff approval → bill → payment (T1, ₹179 = ₹170 + 5% GST, rounded).
   - Captain: seat T4 → add dish → send to kitchen → bill ₹242 → ₹300 cash → change ₹58 → table
     freed.
   - Day screen and Home dashboard, with figures compared against raw database totals.
     - Cash in drawer ₹2,091 matched exactly.
     - Past day 6 Oct: total = collected = ₹13,724, and the GST rows add up.
2. **Code audit** (read-only) of every step: orders, KOTs, bills, discounts, split payments, voids,
   day close, reports, Home figures, permissions, indexes and timezones.
3. **Full test suites after the fixes:**
   - API: 43 unit and 284 end-to-end tests.
   - Staff app: 495 tests.
   - QR app: 52 tests.
   - Lint and type checks are clean.

## Broken things found and fixed today

| # | Problem | Effect | Fix |
| --- | --- | --- | --- |
| 1 | `crypto.randomUUID` missing on phones over plain http | Captain crashed at payment. Sending KOTs, new orders, expenses, purchases and QR orders also broke on phones | Own ID helper that works on http. A lint rule now blocks the old call |
| 2 | QR stickers pointed at a dev address that served no menu | Scanning showed "Page not found" (dev only, production was fine) | Dev server now serves `/qr/` and accepts phones on the Wi-Fi |
| 3 | Home "Sales today" read ₹0 after midnight while the day was still open | Owner sees no sales late at night | Home shows **This business day** (since it opened) |
| 4 | Sales counted unpaid bills but payment totals did not | Totals that never matched on the same screen | **Collected** and **Unpaid** shown beside Sales everywhere |
| 5 | GST "Taxable" included No-GST items, and there was no breakup by rate | GST over-declared if filed from these reports | Taxable covers taxed lines only, plus a **GST by rate** table and a **No GST sales** row. The printed bill lists No-GST items apart |
| 6 | Home sales never refreshed | Stale figures next to live ones | Refreshes on every bill, day and expense event, and every 60 s |
| 7 | "Net" was sales including GST minus expenses | Read as profit, but too high | Renamed **After expenses** = sales − GST − expenses |
| 8 | Payment-mix percentages could total 99% or 101% | Looks wrong | Rounded so they always total 100% |
| 9 | Printouts used the PC's clock zone | Wrong invoice date if the PC zone is wrong | Every printout uses India time |
| 10 | Day report and Reports ranked top items differently | Different "best sellers" | Both rank by amount |
| 11 | QR request on a printed bill could not be approved, with no explanation | Dead button | Marked "Bill already printed, reject or reopen the bill" |

## Verified correct

- **Bill maths:**
  - Integer paise throughout.
  - Discount and packaging allocation is exact.
  - Round-off is recorded.
  - No-GST lines carry no tax.
- **Payments:**
  - Overpayment is refused.
  - Change does not inflate cash sales.
  - A double tap never charges twice.
- **Tables:** a table is freed only when its order is fully billed and paid.
- **Voids:** voided bills are left out of cash, payment mix and sales.
- **Day close:**
  - Expected cash = opening + cash sales − cash expenses, the same on every screen.
  - Closing is locked against late work.
  - Reopening is owner-only and audited.
- **Reports:**
  - Hours and dates are in IST.
  - No overflow past ₹2.15 crore.
  - Empty ranges show zeros.
  - Owner-only access.
  - Correct indexes, no N+1 queries.

## Still open (minor, not blocking)

1. Voiding a bill that was already paid creates no refund record, so a cash refund shows up as drawer
   variance.
2. Reopening a day overwrites its first close figures.
3. Stock kept in grams or ml can overflow at about 2,147 kg if never counted.
4. The kitchen screen still shows the ticket of a voided order.
5. Renaming a dish splits it into two rows in the reports.
6. Two business days opened on one date give two chart bars.
7. "Average bill" counts split bills separately.
8. The day report's bill order is wrong across 1 April, when bill numbers restart.
9. The Home weekly chart's "today" bar still uses the calendar date.

## Things to do before going live

- **Business day:** the dev data's business day has been open since 7 Oct. In real use, close the
  day every night. Home warns after 20 hours.
- **Staff phones:** run production over **https** (see `docs/deploy.md`, TLS compose file). Plain
  http on the Wi-Fi works now, but https keeps logins private.
- **Printing PC:** set its clock to India time anyway. Printouts no longer depend on it, but the
  browser log does.
- **Reports access:** Reports are owner-only. Give a manager access only if you want them to see
  revenue.
