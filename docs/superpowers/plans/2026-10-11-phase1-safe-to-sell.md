# Phase 1: Safe to sell, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** close the legal, cash-control and fraud gaps found in the audit, so the POS can be sold to
restaurants.

**Architecture:**
- **Additive only:** small schema changes in hand-written, additive migrations.
- **Money logic:** stays in the existing API services (billing, day close, payments, reports). Fixed
  reason lists and validators live in `packages/shared`.
- **UI:** extends the existing Settle panel, Day page, Reports page, Settings and the print templates.

**Tech Stack:** NestJS 11 + Prisma 6 (Postgres 16), React 19 + TanStack Query + Tailwind 4, Zod in
`packages/shared`, Jest (API unit and e2e), Vitest + Testing Library (web).

**Spec:** `docs/superpowers/specs/2026-10-11-phase1-safe-to-sell-design.md`. Read it first; this plan
argues from it.

## Global Constraints

**Money and time**
- Money is integer paise everywhere, and display uses `rupees()`.
- On-screen and printed times use `shared/lib/when.ts`, which formats in `Asia/Kolkata`.
- CI runs in UTC. Run the web tests once with `$env:TZ='UTC'` too.

**Migrations**
- Hand-written in `apps/api/prisma/migrations/2026101113xxxx_<name>/migration.sql`. Additive only:
  no drops and no destructive type changes.
- After applying them: `prisma migrate diff --from-schema-datasource prisma/schema.prisma
  --to-schema-datamodel prisma/schema.prisma` must print "No difference detected".
- Changing a column default must not rewrite existing rows. Existing outlets keep their tax scheme.

**Permissions, audit and approvals**
- Any action that needs a manager reuses the existing manager-approval / override-token flow. Do not
  build a second PIN prompt.
- Every new audited action uses `AuditService.record` with dotted action names: `bill.reprint`,
  `kot.reprint`, `cash.pay_in`, `cash.pay_out`, `cash.drop`, `payment.mode_change`, `expense.create`,
  `expense.update`, `expense.void`.

**Shared code and frontend rules**
- Reason lists and the GSTIN/VPA validators live in `packages/shared`. Rebuild with
  `pnpm --filter @rpos/shared build` before web or api use them.
- Frontend: follow the feature folder rules in `apps/web/ARCHITECTURE.md`. Features import each other
  only through `index.ts`.
- Recharts is imported only inside `features/reports/charts`.
- Use the QR library already used for table stickers (`features/tables/qrImages.ts`), lazy-loaded.

**Size limits**
- The staff entry chunk stays under 260 kB gzip. It is about 254 kB today.

**Before each merge**
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter @rpos/api test:e2e`
  and `pnpm build` all pass.

**Commits**
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An existing REGULAR outlet with no GSTIN must keep billing.**
   - A migration or validator that blocks or alters its bills would stop a live restaurant.
   - Test: the e2e in Task 1 (`billing still works for a REGULAR outlet without a GSTIN, and settings
     refuses to save REGULAR without one`).
2. **Expected cash must be one formula everywhere:** the close check, the close, the day report, the
   Home tile and the printout.
   - Test: in Task 6, one e2e posts a cash payment, a refund, an expense, a pay-in, a pay-out and a drop,
     then asserts the same expected figure from all three API endpoints.
3. **A payment-mode change after the day closes must be refused**, and a change on the same day must
   move cash expected.
   - Test: in Task 7 (`refuses to change a payment's mode once its day is closed` and `moves expected
     cash when a cash payment becomes UPI`).
4. **Reprint numbering must survive a concurrent double tap.** Two prints at the same moment must
   produce REPRINT #1 and #2, never #1 twice.
   - Test: in Task 3, the counter is incremented atomically (`increment` in the same update that
     returns the number), and an e2e fires two reprints with `Promise.all`.
5. **Invoice-date grouping across midnight and the financial year.**
   - A bill at 23:59 IST on 31 March and one at 00:01 IST on 1 April fall in different months and
     series.
   - Test: in Task 8, an e2e with fixed `createdAt` values.

---

### Task 1: P1, GST scheme safety

**Files:**
- **Create:**
  - `packages/shared/src/gstin.ts` and `gstin.test.ts`.
  - The migration `20261011130000_tax_scheme_default_none`. It only runs
    `ALTER TABLE outlets ALTER COLUMN tax_scheme SET DEFAULT 'NONE';`.
- **Modify:**
  - `apps/api/prisma/schema.prisma`: the Outlet `taxScheme @default(NONE)`.
  - The outlet settings schema in `packages/shared` (find `outletSettingsUpdate`).
  - `apps/api/src/outlet/outlet.service.ts`.
  - `apps/web/src/features/printing/templates/billTicket.ts`.
  - The web settings page and its components (`features/settings`).
  - `apps/web/src/app/home/owner/*`, for the GSTIN warning.
  - `apps/api/src/reports/sales-report.service.ts` and the Reports page, for composition figures.

**Interfaces:**
- Produces:
  - `isValidGstin(value: string): boolean` and `gstinSchema` (Zod, uppercased and trimmed) from
    `@rpos/shared`.
  - `COMPOSITION_RESTAURANT_RATE_BP = 500` from `@rpos/shared`.
  - `billTitle(scheme: TaxScheme): 'Tax Invoice' | 'Bill of Supply' | 'Bill'` in `billTicket.ts`.

**Steps:**

- [ ] **Shared validator.** Write `gstin.test.ts` first, with these cases:
  - `27AAPFU0939F1ZV` is valid.
  - Lower case is accepted after uppercasing.
  - 14 characters is invalid.
  - State code `00` or `39` is invalid.
  - A bad pattern such as `27AAPFU0939F1Z@` is invalid.

  Check the format with `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`, then check the state code is
  01–38. Do not add the checksum. Run it to see it fail, implement, see it pass, then rebuild shared.
- [ ] **Settings rule (API).** Write the e2e first, in the existing outlet settings e2e file:
  - `PATCH /api/outlet` with `taxScheme: 'REGULAR'` and no GSTIN (stored or in the body) → 400
    `VALIDATION`, message "Add your GSTIN to charge GST.".
  - The same for `COMPOSITION`.
  - With a valid GSTIN → 200.
  - Setting `NONE` → 200, and it does not clear the stored GSTIN.
  - **Review Focus #1:** add the test `billing still works for a REGULAR outlet without a GSTIN, and
    settings refuses to save REGULAR without one`. Force the outlet to REGULAR with no GSTIN through
    Prisma, create and pay a bill, and expect 201. Then PATCH another setting, such as the bill
    footer, and expect 200. Only changing to or keeping a GST scheme without a GSTIN is refused, and
    only when the request touches `taxScheme` or `gstin`.

  Implement in `outlet.service.update`: validate the effective scheme and GSTIN after merging the
  request with the stored row, only when the request includes `taxScheme` or `gstin`.
- [ ] **Migration.** Apply it with `prisma migrate deploy`. Confirm the diff is empty, and that an
  existing outlet row keeps REGULAR.
- [ ] **Bill print.** Write `billTicket.test.ts` cases first:
  - REGULAR prints "Tax Invoice", the GSTIN, CGST/SGST rows and "SAC 996331".
  - COMPOSITION prints "Bill of Supply", the GSTIN, the exact declaration "Composition taxable person,
    not eligible to collect tax on supplies", and no tax rows.
  - NONE prints "Bill", with no GSTIN line and no tax rows.

  Implement `billTitle` and the blocks.
- [ ] **Settings and Home warning (web).** Write tests first:
  - The Settings form shows the GSTIN field as required when Regular or Composition is chosen, and
    shows the API error message.
  - The owner Home shows a red callout "Add your GSTIN — you are charging GST without one" with a
    link to `/admin/settings` when the outlet is REGULAR or COMPOSITION without a GSTIN. Use the
    existing outlet query.
- [ ] **Composition in reports.** The sales report returns `composition: { turnover, taxPayable } |
  null`, non-null only for COMPOSITION outlets. Tax payable is
  `Math.round(turnover * COMPOSITION_RESTAURANT_RATE_BP / 10000)`, and turnover is the non-void bill
  totals.
  - Reports page: show "Turnover (composition)" and "Composition tax payable (5%)" instead of the GST
    table.
  - E2e plus a web test.
- [ ] **Run the gates and commit:** `feat(gst): default new outlets to not registered, require a GSTIN
  to charge GST, and print the right bill title`.

### Task 2: P2, bill print fixes and customer GSTIN

**Files:**
- **Create:** the migration `20261011130100_bill_customer`, which adds the nullable columns
  `customer_name text` and `customer_gstin text` to `bills`.
- **Modify:**
  - `schema.prisma` (Bill).
  - `apps/api/src/billing/bills.service.ts`, `bills.controller.ts` and `bill.views.ts`.
  - `apps/api/src/print/print.service.ts`, for the payload lines and customer.
  - `billTicket.ts`.
  - The Settle panel (`features/billing/components/SettlePanel*`).
  - `packages/shared/src/billing.ts`, for a new `billCustomerSchema`.

**Interfaces:**
- Consumes: `gstinSchema` (Task 1).
- Produces:
  - `PATCH /api/bills/:id/customer` with body `{ name?: string|null, gstin?: string|null }`, which
    returns the bill view.
  - The bill view gains `customer: { name: string|null, gstin: string|null }`.
  - Print payload lines gain `rate` (paise per unit, before discount), `quantity` and `gross`
    (`rate × qty`), plus `lineDiscount` (paise, 0 when none).
  - The print payload gains `customer`.

**Steps:**

- [ ] **Line maths test.** Write the failing `billTicket.test.ts` case first: two Paneer Tikka at ₹200
  with a ₹40 dish discount, plus Naan ₹50. Expected print:
  - `2 × ₹200 = ₹400`
  - `Discount −₹40`
  - `1 × ₹50 = ₹50`
  - Subtotal ₹450
  - The numbers shown before the subtotal must add up to the subtotal. Assert by parsing the rendered
    text.
- [ ] **Payload test.** Write the `print.e2e` test first: the payload lines carry `rate`, `quantity`,
  `gross` and `lineDiscount`, and `sum(gross) − sum(lineDiscount) === subtotal`. Implement in
  `print.service.ts` from the `bill_items` snapshot. Read `bill-calc.ts` to see where line discounts
  live, and do not change bill maths.
- [ ] **Customer endpoint (TDD e2e).**
  - Invalid GSTIN → 400.
  - Allowed while the bill is OPEN or PAID on an open day.
  - VOID → 409.
  - Audited as `bill.customer`.
  - The print payload and the CSV (Task 8) use it.
- [ ] **Printing the customer.** "Bill to: <name> · GSTIN <gstin>" under the header, only when set.
  Test.
- [ ] **Settle panel.** An "Add customer GSTIN" link opens a small form with name and GSTIN, saves
  through the endpoint, then shows "Bill to …" with Edit. Web test.
- [ ] **Gates and commit:** `feat(billing): print qty × rate lines that add up, and an optional
  customer GSTIN`.

### Task 3: P4, reprint control

**Files:**
- **Create:** the migration `20261011130200_print_counts`, which adds
  `print_count integer NOT NULL DEFAULT 0` to `bills` and `kots`. Check the real table names with
  `@@map` in `schema.prisma`.
- **Modify:**
  - The print service methods that queue a bill or KOT print. Find them with
    `graphify query "queue bill print job" --budget 1500`.
  - The KOT reprint endpoint and button (`KotCard.tsx`).
  - The bill print button.
  - `kotTicket.ts` and `billTicket.ts`.
  - The day report (API and screen).
  - `packages/shared`: new `reasons.ts`. Task 4 extends it.

**Interfaces:**
- Produces:
  - `KOT_REPRINT_REASONS = ['PRINTER_JAM','KITCHEN_LOST','OTHER'] as const` with labels.
  - The print payload gains `copy: number`, where 0 is the original and n ≥ 1 is a reprint.
  - The KOT reprint request body is `{ reasonCode, note? }`, and `note` is required when the code is
    OTHER.
  - The day report bills gain `reprints: number`.

**Steps:**

- [ ] **Counter test.** Write the e2e first:
  - The first bill print has payload `copy: 0`.
  - The second has `copy: 1`, with an audit `bill.reprint` whose `after.copy` is 1.
  - **Review Focus #4:** two simultaneous reprints (`Promise.all`) get copies 1 and 2 (`new Set` size
    2).

  Implement `UPDATE … SET print_count = print_count + 1 RETURNING print_count` (Prisma
  `update({ data: { printCount: { increment: 1 } } })` returns the new value), with
  `copy = newCount − 1`.
- [ ] **KOT reprint test.** A missing `reasonCode` → 400. OTHER without a note → 400. A valid code →
  queued, with copy n and audited `kot.reprint` with the reason. The original KOT print is not counted
  as a reprint.
- [ ] **Templates.** "REPRINT #n" at the top of the bill and KOT when `copy ≥ 1`. Template tests.
- [ ] **UI.** The KOT reprint asks for a reason chip in a small dialog. The bill reprint stays one tap.
  Web tests.
- [ ] **Day report.** Show "Reprinted 2×" next to a bill when `reprints > 0`. API e2e and a web test.
- [ ] **Gates and commit:** `feat(print): mark and audit every bill and KOT reprint`.

### Task 4: P8, reason codes and the accountability report

**Files:**
- **Create:**
  - The migration `20261011130300_reason_codes`, which adds a nullable `reason_code text` to `bills`
    (for discounts and voids), to `order_items` (for cancels) and to `orders` (for an order cancel).
  - `apps/api/src/reports/accountability.service.ts`, with a controller route.
  - The web Reports tab `features/reports/components/AccountabilityTab.tsx`.
- **Modify:**
  - `packages/shared/src/reasons.ts`.
  - The discount, void and cancel request schemas, which take `reasonCode` + `note`.
  - The services that apply them.
  - The web reason inputs: the discount sheet, the void dialog and the cancel-dish form.

**Interfaces:**
- Produces from `@rpos/shared`:
  - `DISCOUNT_REASONS = ['REGULAR','COMPLAINT','COMPLIMENTARY','STAFF_MEAL','MANAGER_OFFER','OTHER']`
  - `VOID_REASONS = ['WRONG_ORDER','CUSTOMER_LEFT','DUPLICATE','PAYMENT_ISSUE','OTHER']`
  - `CANCEL_REASONS = ['CHANGED_MIND','OUT_OF_STOCK','WRONG_DISH','LONG_WAIT','OTHER']`
  - `reasonLabel(kind, code)`
- Requests: `{ reasonCode, note? }`. A note is required for OTHER. The existing free-text fields are
  filled with `note ?? label`, so old screens and reports keep working.
- `GET /api/reports/accountability?from&to` (requires `reports.all`) returns:
  `{ byReason: { kind, code, count, amount }[], byStaff: { userId, name, discounts:{count,amount},
  voids:{count,amount}, cancels:{count,amount}, reprints:number, cashOut:{count,amount},
  modeChanges:number }[] }`. In this task `cashOut` is `{count:0, amount:0}` and `modeChanges` is 0.
  Task 6 fills in `cashOut` and Task 7 fills in `modeChanges`, each with its own test.

**Steps:**

- [ ] **Shared lists and label tests.**
- [ ] **API e2e for each action.**
  - A valid code is stored and audited.
  - OTHER without a note → 400.
  - A legacy request with only the old `reason` string still works, mapped to OTHER with that note,
    so a cached older web build keeps working during an update.
- [ ] **Accountability e2e.** Two staff members, discounts with two reasons (one COMPLIMENTARY), a
  void and a cancel. Assert the totals by reason and by staff, IST date range.
- [ ] **Web chips.** Chips replace the free-text inputs, and "Other" reveals a note field. Web tests
  for each of the three forms.
- [ ] **Reports tab.** "Discounts & voids" shows the by-reason and by-staff tables, with empty states.
  Web test.
- [ ] **Gates and commit:** `feat(reports): reason codes for discounts, voids and cancels, and who did
  what`.

### Task 5: P3, blind day close with a note count

**Files:**
- **Create:** the migration `20261011130400_day_close_count`.
  - Adds `close_count jsonb` and `close_reason_code text` to `business_days`.
  - Adds `variance_alert_paise integer NOT NULL DEFAULT 10000` to `outlets`.
- **Modify:**
  - `apps/api/src/business-day/day-close.service.ts` and its controller.
  - `packages/shared` back-office schemas: the close request.
  - The web `features/day` close form.
  - The day report screen and its printout.
  - Settings, for the threshold.

**Interfaces:**
- **Close request:**

  ```
  {
    countedCash: number,
    count?: { notes: Record<'500'|'200'|'100'|'50'|'20'|'10', number>, coins: number },
    reasonCode?: 'SHORT_CHANGE'|'EXPENSE_MISSING'|'COUNT_ERROR'|'OTHER',
    note?: string
  }
  ```

  When `count` is present, `countedCash` must equal the sum of the notes plus coins, or the request
  fails with 400 `COUNT_MISMATCH`.
- **Close-check change:** a new query `?blind=1` leaves out `cash.expected` for the closing screen.
  The Home tile keeps the normal call.
- **Check endpoint:** `POST /api/business-day/:id/close/check-count` with `{ countedCash }` returns
  `{ expected, variance, needsReason: boolean }`. It does not close the day.

**Steps:**

- [ ] **API tests (e2e).**
  - The mismatched count → 400.
  - A variance above the threshold without a reason → 400 `REASON_REQUIRED`.
  - With a reason → closed, with the count and reason stored and returned in the day report.
  - A variance below the threshold closes without a reason.
  - The threshold comes from the outlet setting.
- [ ] **Web close flow.**
  1. The screen shows no expected figure, only a note counter with + and − and a typed amount per
     note, plus coins.
  2. A running total.
  3. "Check count".
  4. The screen then shows expected, counted and variance, plus reason chips when `needsReason`.
  5. "Close day".

  A "Type total instead" toggle stays available. Web tests: expected is hidden before the check,
  counting 3 × ₹500 + 2 × ₹100 + ₹30 coins gives ₹1,730, and the reason is required above the
  threshold.
- [ ] **Day report and printout.** Show the note count table and the reason. Tests.
- [ ] **Settings.** "Variance alert above (₹)" with a default of 100. Test.
- [ ] **Gates and commit:** `feat(day): blind cash count by notes, with a reason for a large
  variance`.

### Task 6: P5, cash movements and petty cash

**Files:**
- **Create:**
  - The migration `20261011130500_cash_movements`.
    - Adds the enum `CashMovementType (PAY_IN, PAY_OUT, DROP)`.
    - Adds the table `cash_movements`: `id uuid pk`, `outlet_id`, `business_day_id`, `type`,
      `amount integer CHECK (amount > 0)`, `reason_code text`, `note text`, `created_by_id`,
      `approved_by_id`, `created_at`. The foreign keys are like `expenses`, plus an index on
      `(business_day_id)`.
    - Adds `petty_cash_limit_paise integer NOT NULL DEFAULT 200000` to `outlets`.
  - `apps/api/src/cash/` (module, service, controller, with an e2e at `apps/api/test/cash.e2e-spec.ts`).
  - The web `features/cash/` (api, mutations, `CashDialog.tsx`, `index.ts`).
- **Modify:**
  - The expected-cash calculation in `day-close.service.ts`. This is the single source; find it with
    `graphify explain "DayCloseService"`.
  - The expense service, for the limit and audit.
  - The POS header and the Day page, for the "Cash" button.
  - The day report and its printout.
  - The accountability service, which gains `cashOut`.
  - Settings, for the limit.

**Interfaces:**
- `POST /api/cash-movements` with `{ type, amount, reasonCode, note?, overrideToken? }` returns the
  movement.
  - PAY_OUT and DROP without `day.openClose` need a valid manager `overrideToken`, using the same
    mechanism as discounts above the cap.
  - Reason codes: PAY_IN `FLOAT_TOP_UP|OTHER`; PAY_OUT `SUPPLIER|STAFF_ADVANCE|OTHER`;
    DROP `SAFE|BANK|OTHER`.
- `GET /api/cash-movements?businessDayId` returns a list.
- **The expected-cash formula becomes:**

  > expected = opening + cash payments − cash refunds − cash expenses + pay-ins − pay-outs − drops

- **Expenses:** a cash expense above `pettyCashLimitPaise` needs an `overrideToken` from a
  non-manager. Create, update and void are audited as `expense.create|update|void`.

**Steps:**

- [ ] **E2e: movements and approval.**
  - Each type moves the expected figure the right way.
  - PAY_OUT by a cashier without a token → 403 `APPROVAL_REQUIRED`, and with a manager token → 201.
  - Audited.
- [ ] **E2e: one formula (Review Focus #2).**
  - Post a cash payment, a refund (void a paid bill), a cash expense, a pay-in, a pay-out and a drop.
  - Assert the same expected value from `GET close-check`, the day report, and the close's stored
    expected value.
- [ ] **E2e: petty cash.**
  - A cashier's expense of ₹2,500 without a token → 403, and with one → 201.
  - ₹1,500 → 201.
  - The audit rows exist.
- [ ] **Web CashDialog.**
  - Three tabs, amount, reason chips and a note.
  - The manager PIN step appears when the API asks for it; reuse the existing approval component.
  - The "Cash" button sits on the POS header and on the Day page.
  - Web tests.
- [ ] **Day report.** A "Cash in / out" section with the totals and a list. The printout too.
  Accountability `cashOut` filled in. Tests.
- [ ] **Settings.** "Petty cash limit (₹)" with a default of 2,000. Test.
- [ ] **Gates and commit:** `feat(cash): pay-ins, pay-outs and cash drops, with petty cash limits`.

### Task 7: P6, payment-mode correction, UPI QR and references

**Files:**
- **Create:**
  - The migration `20261011130600_upi_and_payment_ref`:
    - adds `upi_vpa text`, `upi_payee text` and `print_upi_qr boolean NOT NULL DEFAULT true` to
      `outlets`;
    - adds `reference text` and `mode_changed_from text` to `payments`.
  - `packages/shared/src/upi.ts`, with `vpaSchema` (`^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$`)
    and `upiLink({vpa,payee,amountPaise,note})`. Write the amount with 2 decimals; the payee and note
    are URL-encoded.
  - `apps/web/src/features/billing/components/UpiQr.tsx`, lazy-loaded through the stickers' QR helper.
- **Modify:**
  - The payments service and controller.
  - The settle panel's UPI and card confirm steps.
  - `billTicket.ts`: a QR image for unpaid bills. The template gets a data-URL SVG made by the web
    before printing, or the API sends `upiLink` and the web renders it. Pick the web side, so the API
    stays free of QR code.
  - The day report: the reconciliation lists.
  - Settings: UPI fields.
  - Accountability: `modeChanges`.

**Interfaces:**
- `POST /api/payments/:id/change-mode` with `{ mode, reasonCode: 'WRONG_MODE'|'OTHER', note?,
  overrideToken? }` returns the bill view. A manager token is needed unless the caller has
  `day.openClose`.
  - Refuse with 409 `DAY_CLOSED` if the payment's bill belongs to a closed day.
  - Refuse with 409 `REFUNDED` if the payment was refunded.
  - Sets `mode_changed_from`, audited as `payment.mode_change`.
- The add-payment body gains an optional `reference`
  (`^[A-Za-z0-9]{6,22}$`).
- The day report gains `reconciliation: { upi: {withRef, withoutRef, amountWithout},
  card: {…} }` and a list of UPI/card payments without a reference.

**Steps:**

- [ ] **Shared tests.** VPA validity, and the exact `upiLink` output for
  `{vpa:'spicegarden@okicici', payee:'Spice Garden', amountPaise:24200, note:'Bill 135'}`, which is
  `upi://pay?pa=spicegarden%40okicici&pn=Spice%20Garden&am=242.00&cu=INR&tn=Bill%20135` (assert
  whichever encoding you choose, consistently, and document it).
- [ ] **E2e: mode change.**
  - Cash → UPI moves expected cash down by the amount (Review Focus #3).
  - After the day closes → 409 (Review Focus #3).
  - A refunded payment → 409.
  - A cashier without a token → 403.
  - Audited.
- [ ] **E2e: references.** A reference is stored, an invalid one → 400, and the day report's
  reconciliation counts are right.
- [ ] **Web.**
  - Choosing UPI in the Settle panel shows the QR, with the amount and "Scan to pay ₹242", when a VPA
    is set. Otherwise it shows a hint to "Add your UPI ID in Settings" (owner only).
  - An optional "Reference" field on UPI and card confirm.
  - On a paid bill, the payment row has a "Change mode" action that opens a dialog with a manager PIN
    when needed.
  - The bill print shows the QR when the bill is unpaid and `printUpiQr` is on.
  - Tests for each.
- [ ] **Settings.** UPI ID, payee name and "Print UPI QR on bills". Test with validation.
- [ ] **Gates and commit:** `feat(payments): fix a wrong payment mode, UPI QR with the amount, and
  references for reconciliation`.

### Task 8: P7, GST report by invoice date and the bill register

**Files:**
- **Create:**
  - `apps/api/src/reports/gst-report.service.ts`, with a route `GET /api/reports/gst?from&to` and
    `GET /api/reports/bill-register.csv?from&to`.
  - The e2e `apps/api/test/gst-report.e2e-spec.ts`.
  - The web `features/reports/components/GstTab.tsx`.
- **Modify:** the reports controller, the Reports page tabs, and `packages/shared` report types.

**Interfaces:**
- `GET /api/reports/gst` (requires `reports.all`) returns:
  - `{ range, scheme, b2cByRate: { ratePercent, taxable, cgst, sgst, total }[], exempt, sac: { code:
    '996331', quantity, value }, series: { fy: '2026-27', first, last, count, voided }[],
    composition: { turnover, taxPayable } | null }`
  - Rows are grouped by the bill's `created_at` in IST, not by business day.
  - Rate figures come from the `gstSummary` helper in `apps/api/src/billing/gst-summary.ts`.
- `bill-register.csv`:
  - UTF-8 with a BOM, so Excel shows ₹ and Hindi correctly.
  - One row per bill, in this column order: `Bill no, Date, Time, Type, Table, Subtotal, Discount,
    Packaging, Taxable, CGST, SGST, Round off, Total, Paid by, Status, Customer GSTIN`.
  - Money is in rupees with 2 decimals.

**Steps:**

- [ ] **E2e: invoice date (Review Focus #5).**
  - Bills with fixed `createdAt` values at 2027-03-31T18:29Z (23:59 IST, 31 Mar) and
    2027-03-31T18:31Z (00:01 IST, 1 Apr).
  - A March range includes only the first, and an April range only the second.
  - The series show FY 2026-27 and FY 2027-28 separately.
- [ ] **E2e: summary figures.**
  - Rate rows, exempt, SAC quantity and value, voided bills counted in the series but not in the
    totals.
  - Composition outlet → `composition` filled and `b2cByRate` empty.
- [ ] **E2e: CSV.** Header row exact, BOM present, one row per bill, a void bill row with status
  VOID and zero totals or its original totals (choose "original totals, Status VOID" and assert it).
- [ ] **Web GST tab.**
  - Date range (reuse the existing range picker), the tables, and both download buttons. The
    downloads use the existing CSV-download helper from the sales report.
  - Empty state.
  - Web tests.
- [ ] **Gates and commit:** `feat(reports): GST report by invoice date and a bill register for the
  accountant`.

### Task 9: Whole-phase check and merge

- [ ] **Owner Home and Day screen in the browser.** Check them with the QA owner
  (`pnpm --filter @rpos/api db:qa-owner <file>`):
  - the GSTIN warning;
  - the Cash button and dialog;
  - the blind close screen (do not actually close the dev day unless the user asks);
  - the UPI QR in the Settle panel;
  - the GST tab and the CSV download;
  - the Discounts & voids tab.

  Check at phone and desktop sizes, light and dark.
- [ ] **Fresh Opus reviewer over the whole branch.** Fix Critical and Important issues with tests.
  Log Minor ones in `.superpowers/overnight-notes.md`.
- [ ] **Gates in UTC, then merge** with `--no-ff` into `main` locally. Do not push without the user's
  OK.
- [ ] **User manual.** Note which chapters are now out of date (GST, bills, day close, cash,
  payments, reports) in the final summary to the user.
