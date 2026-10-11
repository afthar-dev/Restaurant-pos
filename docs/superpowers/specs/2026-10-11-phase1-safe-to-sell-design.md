# Phase 1: Safe to sell (design)

**Goal:** close the legal, cash-control and fraud gaps the audits found
(`docs/audit/2026-10-11-whole-app-audit.md`), so the app can be sold to restaurants. Eight parts, built
and merged one at a time. Each part ships with tests and keeps every existing screen working.

**Not in scope:** multi-tenant work, offline billing, languages, delivery apps (Phases 2–3).

## P1. GST scheme safety

- **Default for new outlets:** `taxScheme` defaults to `NONE` ("Not registered"). Existing outlets keep
  their stored value; the migration only changes the column default.
- **GSTIN rule:**
  - `REGULAR` and `COMPOSITION` require a valid GSTIN: 15 characters, matching the GSTIN pattern, with
    the state code 01–38 checked. Settings refuses to save these schemes without one.
  - An existing outlet already on REGULAR without a GSTIN keeps billing. Settings and Home show a red
    "Add your GSTIN" warning until it is fixed.
- **Bill titles and tax by scheme:**

| Scheme | Title | Tax on bill | Extra wording |
| --- | --- | --- | --- |
| REGULAR | Tax Invoice | CGST + SGST per rate, SAC 996331 | GSTIN |
| COMPOSITION | Bill of Supply | none | GSTIN, plus "Composition taxable person, not eligible to collect tax on supplies" |
| NONE | Bill | none | none (no GSTIN line) |

- **Reports for composition outlets:**
  - Show "Turnover (composition)" and "Composition tax payable (5%)", worked out on the turnover.
  - The rate is a named constant, `COMPOSITION_RESTAURANT_RATE_BP = 500`.

## P2. Bill print fixes

- **Each bill line:** `qty × rate` and the line amount *before* any dish discount.
- **Discounts:** dish discounts are printed as their own "Discount" lines, so the lines add up to the
  Subtotal.
- **Totals block:**
  1. Subtotal
  2. Discount (bill)
  3. Packaging
  4. Taxable
  5. GST rows
  6. Round-off
  7. Total
- **Bill to (B2B):** an optional customer name and customer GSTIN.
  - Entered from the Settle panel ("Add customer GSTIN") before the bill is printed or reprinted.
  - Stored on `bills.customer_name` and `bills.customer_gstin`; the GSTIN is validated.
  - Printed as "Bill to: <name>, GSTIN <x>".

## P3. Blind day close with a note count

- **Closing screen:**
  - The expected cash stays hidden.
  - The manager counts using a note counter: ₹500, 200, 100, 50, 20, 10, plus coins in ₹.
  - "Use total only" stays available for anyone who prefers to type one figure.
- **After "Check count":** the screen shows expected, counted and variance.
- **Variance threshold:**
  - If |variance| is more than the outlet's `varianceAlertPaise` (setting, default ₹100), a reason is
    required (chips: "Short change given", "Expense not entered", "Counting error", "Other" + note).
  - At or below the threshold, a note is optional.
- **Records:**
  - The note count is stored as JSON on the day's close record.
  - The day report and its printout show the count and the reason.
- **Cash dashboard:** the owner's Home tile "Cash expected" keeps showing the figure, because the owner
  is not the person counting.

## P4. Reprint control

- **Counters:** `bills.print_count` and `kot_tickets.print_count` go up on every print. The first print
  is the original.
- **Reprinted copies:** carry the header "REPRINT #n". The first print has no mark.
- **Audit:** every reprint writes `bill.reprint` / `kot.reprint`.
  - **KOT reprint:** needs a reason chip ("Printer jam", "Kitchen lost it", "Other").
  - **Bill reprint:** the reason is optional.
- **Day report:** shows the reprint count per bill when it is above 0.

## P5. Cash in and out of the drawer

- **New table:** `cash_movements` with:
  - `businessDayId`
  - `type`: PAY_IN | PAY_OUT | DROP
  - `amountPaise`
  - `reasonCode` + `note`
  - `createdById`
  - `approvedById`
  - `createdAt`
- **Where:** a new "Cash" button on the POS header and the Day screen opens "Cash in / Cash out / Cash
  drop".
- **Manager PIN:** PAY_OUT and DROP need a manager PIN when done by someone without `day.openClose`,
  reusing the existing manager-approval flow.
- **Audit:** every cash movement is written to the audit log.
- **Expected cash:**

  > Expected = opening + cash payments − cash refunds − cash expenses + pay-ins − pay-outs − drops

  This one formula is used on the close check, the close, the day report, the Home tile and the
  printout.
- **Petty-cash limit:**
  - Cash expenses above the outlet's `pettyCashLimitPaise` (default ₹2,000) need a manager PIN.
  - Every expense create, edit and delete is now audited.

## P6. Payment correction and UPI

- **Change payment mode:**
  - On a paid bill, the same business day only.
  - Cash ↔ UPI ↔ card for one payment, with a manager PIN and a reason.
  - Audited as `payment.mode_change`.
  - Expected cash follows the corrected mode.
- **UPI QR:**
  - **Settings:**
    - UPI ID (VPA, validated as `name@bank`).
    - Payee name.
    - Print the UPI QR on bills (on/off, default on when a VPA is set).
  - **Settle panel:** choosing UPI shows a QR for
    `upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=Bill <no>`, generated with the QR library
    already used for table stickers.
  - **Printed bill:** shows the same QR under the total when the bill is unpaid.
- **Reference (optional):**
  - An optional "UPI / card reference" field (6–22 letters and digits) when confirming a UPI or card
    payment, stored as `payments.reference`.
  - The day report lists UPI and card payments with and without a reference, for reconciliation.

## P7. GST report and bill register

- **Reports → new "GST" tab:**
  - Bills are grouped by **invoice date** (the bill's creation time in IST), not by business day.
  - **B2C summary by rate:** taxable, CGST, SGST, total.
  - **HSN/SAC summary:** SAC 996331, with quantity and value.
  - **Invoice series:** first and last number, count, and cancelled (void) count, per financial year.
  - **Composition summary** for COMPOSITION outlets.
  - **Exempt / No GST** total.
- **Bill register export:** CSV, one row per bill, with:
  - number, date and time
  - order type and table
  - subtotal, discount and packaging
  - taxable, CGST and SGST
  - round-off, total
  - payment modes, status
  - customer GSTIN
- **Downloads:** "Download GST summary (CSV)" and "Download bill register (CSV)". The files open in
  Excel.

## P8. Reason codes and accountability reports

- **Fixed reason lists** in `packages/shared`:
  - **Discount:** Regular customer, Complaint, Complimentary, Staff meal, Manager offer, Other.
  - **Void:** Wrong order, Customer left, Duplicate bill, Payment issue, Other.
  - **Dish cancel:** Customer changed mind, Out of stock, Wrong dish, Long wait, Other.
- **How staff pick one:**
  - Chips replace typing; "Other" requires a note.
  - Stored as `reasonCode` + `note` alongside the existing free-text reason. Old rows map to "Other".
- **"Complimentary" and "Staff meal"** are discount reasons, so they show in reports.
- **Reports → "Discounts & voids" tab**, with totals by reason and by staff member over a date range:
  - discounts
  - complimentary and staff meals
  - voids
  - cancelled dishes
  - reprints
  - cash movements
  - payment-mode changes

## Build order and safety

- **Order:** P1 → P2 → P4 → P8 → P3 → P5 → P6 → P7, from smallest to largest. Each part is a branch
  with TDD, e2e for API changes and web tests for screens.
- **Migrations:** hand-written and additive only, with no destructive DDL.
- **Checks on every part:** CI-equivalent checks in UTC, a browser check, a fresh Opus review of the
  whole branch, then merge.
- **Bundle:** QR generation stays lazy-loaded. The staff entry chunk stays under 260 kB gzip.
- **Implementation:** done by Sonnet subagents. Planning and review are done on Opus.
