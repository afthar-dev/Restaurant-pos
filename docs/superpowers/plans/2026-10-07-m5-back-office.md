# M5 Back Office (Stock, Purchases, Expenses, Reports) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner runs the back office. That means a stock register (items, purchases, counts, adjustments, low-stock alerts), expenses recorded against the business day (a purchase automatically becomes a "Raw material" expense), day close that subtracts cash expenses, and sales reports over a date range with CSV export.

**Architecture:**
- **API.** Three new Nest modules follow the existing pattern (controller → service → Prisma, Zod bodies from `@rpos/shared`, permission decorators): `expenses`, `stock` (items, transactions, purchases) and `reports`.
  - Money is integer paise. Quantities are **integer thousandths of the unit** (`qtyMilli`: 1.5 kg = 1500), so there are no floats or Prisma `Decimal`s.
  - Every write that belongs to a day runs inside `BusinessDayService.requireOpen(tx)` (FOR SHARE), so it serialises with day close (FOR UPDATE).
- **Web.** Three new features in `apps/web` — `expenses`, `stock`, `reports` — follow `apps/web/ARCHITECTURE.md` (api/keys/queries/mutations/components/pages/index, lint boundaries). The `day` feature shows the cash expenses.

**Tech Stack:** NestJS 11, Prisma 6, Postgres 16, Zod 4, React 19, TanStack Query 5, Vitest/Jest.

**Spec:** `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md` (§1.2 rows 9 and 12, §3.4, §4.2, §4.4 rules 5–7, §5.5, §6.1)

## Global Constraints

- §1.2 #9: "Simple stock register (purchases, counts, low-stock alerts). No recipe deduction".
- §1.2 #12: "Sales reports, day close / shift report, expense tracking. GST report deferred to v2".
- §4.4.5: "`stock_items.current_qty` is a cache of the sum of `stock_txns`. A physical count posts an `ADJUST` for the difference so variance stays visible." (We name that type `COUNT` and keep `ADJUST` for manual corrections such as wastage. Both are signed differences.)
- §4.4.6: "Saving a purchase creates its stock transactions and one expense (category 'Raw material') in a single database transaction."
- §4.4.7: "Every order and expense belongs to an open business day."
- §5.5.4: "Expected cash = opening cash + cash payments − cash expenses."
- §6.1: Stock and purchases: Owner ✅ Manager ✅ (`stock.manage`). Expenses: Owner, Manager, Cashier (`expense.manage`). Reports: Owner all (`reports.all`), Manager day close only.
- Out of scope (§1.3): vendor ledger (no credit purchases or balances), recipe deduction, GST report.
- Money in paise; quantities in thousandths; records are never deleted, only **voided** with a reason (like bills).
- Idempotency-Key on creating a purchase and an expense (the same pattern as payments: `idempotency_keys` row inside the transaction, and P2002 → replay).

## Review Focus

1. **Expense or purchase saved while the manager closes the day.** It is either on the day before close (and counted in expected cash) or refused with `DAY_NOT_OPEN`, never lost between them. → Task 2 test (expense after close → 409 `DAY_NOT_OPEN`; close-check expected includes the expense).
2. **Double tap or lost reply on Save purchase.** One purchase, one expense, stock added once. → Task 3 test (same Idempotency-Key twice → same purchase id, stock counted once).
3. **Fractional quantities and line amounts ("0.250 kg", "1.5", "12").** These parse exactly; zero, negative and more than 3 decimals are refused with a clear message. → Task 1 tests.
4. **Voiding a purchase after some stock was used.** Stock may go negative, and the screen shows it rather than failing. → Task 3 test.
5. **Report range with no sales, a reopened day, or a range over 92 days.** Zeros; a reopened day counts once; the range is refused with a message. → Task 4 tests.

---

### Task 1: Shared schemas and quantity helpers

**Files:** Create `packages/shared/src/back-office.ts` (+ `back-office.test.ts`); export from `packages/shared/src/index.ts`.

**Produces:**
- `parseQuantity(text: string): number | null` — "1.5" → 1500, "0.250" → 250, "12" → 12000. It returns null for empty input, ≤ 0, NaN, more than 3 decimals, or more than 1 000 000 units.
- `formatQuantity(milli: number): string` — 1500 → "1.5", 250 → "0.25", -500 → "-0.5", 12000 → "12".
- `STOCK_UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'pack', 'dozen'] as const`, `type StockUnit`.
- Zod schemas and types:
  - `stockItemSchema {name, unit, minLevelMilli ≥ 0}`
  - `stockAdjustSchema {qtyMilli ≠ 0 (signed), reason 3..140}`
  - `stockCountSchema {countedMilli ≥ 0, note? ≤ 140}`
  - `purchaseSchema {vendorName 1..80, billRef? ≤ 40, paidMode: PaymentMode, note? ≤ 140, lines: 1..50 of {stockItemId uuid, qtyMilli > 0, amount paise > 0}}`
  - `expenseCategorySchema {name}`
  - `expenseSchema {categoryId uuid, amount > 0 ≤ 10 000 000 00, mode: PaymentMode, note? ≤ 140}`
  - `voidSchema {reason 3..140}`
  - `reportRangeSchema {from, to: 'YYYY-MM-DD', to ≥ from, at most 92 days}`

- [ ] Tests: parseQuantity accepts "1.5", "0.250", "12" and " 2 ", and rejects "", "0", "-1", "1.2345", "abc" and "1000001". formatQuantity covers negatives and trailing zeros. The purchase schema rejects zero lines and duplicate stockItemIds (the message is "Each item once per purchase"). The report range rejects to < from and 93 days.
- [ ] Commit `feat(shared): back-office schemas and quantity helpers`.

### Task 2: Expenses API and day close

**Files:**
- Migration `20261007120000_expenses`: `expense_categories (id, outlet_id, name, is_system bool, archived_at)` with a unique (outlet_id, name) where not archived.
- Migration, continued: `expenses (id, outlet_id, business_day_id, category_id, amount int, mode PaymentMode, note, source enum ExpenseSource MANUAL|PURCHASE, purchase_id uuid null unique, created_by_id, voided_at, voided_by_id, void_reason, created_at, updated_at)`, with an index on (business_day_id).
- Create `apps/api/src/expenses/{expenses.module.ts, expenses.controller.ts, expenses.service.ts, expense-categories.service.ts, expense.views.ts}`.
- Modify `business-day/day-close.service.ts` (cashExpenses, report expenses), `business-day/business-day.module.ts` imports, `app.module.ts`, `prisma/seed.ts` (default categories).
- Test: `test/expenses.e2e-spec.ts` and an update to `test/day-close.e2e-spec.ts`.

**Behaviour:**
- **Default categories:** `Raw material` (is_system, cannot be renamed or archived), `Gas`, `Salaries`, `Rent`, `Electricity`, `Repairs`, `Other`. They are created by the seed and by `ensureDefaults(outletId)` on the first list or create, so existing outlets get them too.
- **Category endpoints:** `GET /api/expense-categories`, `POST`, `PUT /:id` (rename) and `POST /:id/archive`, all under `expense.manage`. Changing a system category → 409 `SYSTEM_CATEGORY`.
- **`POST /api/expenses`** (`expense.manage`, optional `Idempotency-Key`):
  - It runs in a transaction with `requireOpen` and writes `businessDayId` = the open day and `source` MANUAL.
  - A replay of the same key returns the same expense.
  - It emits the realtime `expense.updated {dayId}` to the outlet room.
- **`GET /api/expenses?day=current|<dayId>`:** a list (newest first) with category name, createdBy name, and void fields, plus `totals {total, cash, byMode, byCategory[]}` that exclude voided expenses.
- **`POST /api/expenses/:id/void {reason}`:**
  - It works only while the expense's day is the open day; otherwise 409 `DAY_CLOSED`.
  - A PURCHASE expense → 409 `VOID_THE_PURCHASE` ("Void the purchase instead").
  - It is audited (`expense.void`) and emits `expense.updated`.
- **Day close:**
  - `cashExpenses` = the sum of non-void CASH expenses of the day. It is used in closeCheck, in close (expected = opening + cashSales − cashExpenses) and in the report.
  - The report's `expenses` becomes `{ total, cash, byCategory: {name, amount}[] }`.

- [ ] Tests (e2e):
  - Expense on the open day and in the list totals, with defaults present.
  - A cashier may add; a waiter gets 403.
  - Idempotent replay.
  - Without an open day → 409 `DAY_NOT_OPEN`.
  - Void excluded from totals; a void after the day closed → 409.
  - A purchase-sourced void is refused (that test lands in Task 3).
  - Close-check expected = opening + cash sales − cash expenses, and UPI expenses are not subtracted.
  - The day report lists expenses by category.
  - Renaming or archiving `Raw material` → 409.
- [ ] Commit `feat(api): expenses on the business day and cash expenses in day close`.

### Task 3: Stock register and purchases API

**Files:**
- Migration `20261007130000_stock`:
  - `stock_items (id, outlet_id, name, unit, min_level_milli int, current_milli int default 0, archived_at)` with a unique active name.
  - `stock_txns (id, outlet_id, stock_item_id, type enum StockTxnType PURCHASE|PURCHASE_VOID|ADJUST|COUNT, qty_milli int signed, amount int null, purchase_id null, note, created_by_id, created_at)` with an index on (stock_item_id, created_at).
  - `purchases (id, outlet_id, business_day_id, vendor_name, bill_ref, paid_mode, total, note, created_by_id, voided_at, voided_by_id, void_reason, timestamps)`.
  - `purchase_lines (id, purchase_id, stock_item_id, qty_milli, amount)`.
- Create `apps/api/src/stock/{stock.module.ts, stock-items.controller.ts, stock-items.service.ts, purchases.controller.ts, purchases.service.ts, stock.views.ts, post-txn.ts}`.
- Test: `test/stock.e2e-spec.ts`.

**Behaviour:**
- **`postTxn(tx, input)`:** inserts the stock_txn and `UPDATE stock_items SET current_milli = current_milli + qty` (an atomic increment, never read-modify-write). It is the only writer of current_milli.
- **Stock items** (`stock.manage`):
  - `GET /api/stock/items` returns `[{id, name, unit, minLevelMilli, currentMilli, low: current ≤ minLevel && minLevel > 0, lastPurchase {date, rate per unit in paise}|null}]`, low items first, then by name.
  - Also `POST`, `PUT /:id` (name, unit, min level) and `POST /:id/archive`.
- **`POST /api/stock/items/:id/adjust {qtyMilli, reason}`:** an ADJUST txn (wastage, staff meal, correction).
- **`POST /api/stock/items/:id/count {countedMilli, note?}`:** a COUNT txn for `counted − current`, computed under `SELECT … FOR UPDATE` on the item. When the difference is 0 no txn is written. It returns the item and `{difference}`.
- **`GET /api/stock/items/:id/txns?limit=50`:** history with who made each change.
- **`POST /api/purchases`** (`stock.manage`, optional `Idempotency-Key`), one transaction:
  - `requireOpen`; every stock item must belong to the outlet and be active, otherwise 400 `ITEM_UNKNOWN`.
  - Total = the sum of line amounts.
  - It creates the purchase and its lines, one PURCHASE txn per line (amount = line amount), and one expense (category Raw material, mode paidMode, source PURCHASE, purchaseId, note "Purchase from {vendor}[ #billRef]").
  - It emits `stock.updated` and `expense.updated`.
- **`GET /api/purchases?day=current|<dayId>|all&limit`:** list with lines (item name, unit), and `GET /:id`.
- **`POST /api/purchases/:id/void {reason}`:**
  - It works only while the purchase's day is open.
  - It writes PURCHASE_VOID txns with negative quantities (stock may go negative) and voids the linked expense with the same reason.
  - It is audited (`purchase.void`).

- [ ] Tests (e2e):
  - A purchase adds stock and creates a Raw material expense with the purchase mode.
  - Close-check subtracts a CASH purchase.
  - Idempotent replay: one purchase, one expense, and stock is added once.
  - An unknown or archived item → 400.
  - A count posts the difference (and nothing when equal).
  - An adjust needs a reason.
  - Voiding a purchase after an adjust that used the stock leaves stock negative, voids the expense, and the expense void endpoint refuses PURCHASE expenses.
  - Low flag and sort order.
  - 20 concurrent +1 adjusts end at exactly +20.
  - A cashier gets 403.
- [ ] Commit `feat(api): stock register and purchases that post stock and expenses`.

### Task 4: Sales reports API

**Files:** Create `apps/api/src/reports/{reports.module.ts, reports.controller.ts, sales-report.service.ts}`; test `test/reports.e2e-spec.ts`.

**Behaviour:** `GET /api/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` needs `reports.all`. Days are the business days whose `opened_at` (Asia/Kolkata date) falls in the range. All aggregation is SQL (`$queryRaw`) over non-void bills of those days. The response:
```
{ range: {from, to}, days: [{ dayId, date, status, bills, total, cash, upi, card, expenses }],
  summary: { bills, grossSubtotal, discounts, packaging, taxable, cgst, sgst, roundOff, total,
             averageBill, payments: {CASH, UPI, CARD}, byType: {DINE_IN: {orders,total}, PARCEL: {…}},
             expenses: { total, byCategory: [{name, amount}] }, net: total − expenses.total },
  items: [{ itemName, variantName, quantity, amount }]  (all items, by amount desc),
  categories: [{ name, quantity, amount }] }
```
Item amounts use the bill line's `lineTotal` (after item discount, before the bill discount), as the day report does. Category comes from the item's current category; when the item was deleted or archived it is shown under "Other".

- [ ] Tests (e2e):
  - Two days with bills and one voided bill (excluded).
  - Expenses by category, and net = total − expenses.
  - Payments split by mode.
  - A range with no days gives zeros and empty lists.
  - A range over 92 days → 400.
  - A reopened and re-closed day counts once.
  - A manager (dayClose only) gets 403.
- [ ] Commit `feat(api): sales report over a date range`.

### Task 5: Expenses screen and day close in the web app

**Files:**
- Create `apps/web/src/features/expenses/{api,keys,queries,mutations,types,index}.ts`, `components/{ExpenseForm,ExpenseList,CategoriesSheet}.tsx`, `pages/ExpensesPage.tsx` and a test.
- Modify `app/routes.tsx` (`/expenses`, `anyOf ['expense.manage']`) and `app/Home.tsx` (Expenses area).
- Modify `features/realtime/invalidations.ts` (`expense.updated` → expense list and day close-check; `stock.updated` → stock keys).
- Modify `features/day/types.ts` (report expenses byCategory) and `features/day/dayReport.ts` (expense lines in the printout).

**Behaviour:**
- **Page "Expenses (today)":** a form with category select, amount ₹, mode Cash/UPI/Card, and an optional note; Save sends with an Idempotency-Key kept across retries.
- **List:** time, category, note, mode, amount, who; voided rows are struck through. Each row has Void (with reason).
- **Totals:** a bar shows Total and Cash.
- **Categories:** a sheet to add, rename or archive categories. `Raw material` shows "used by purchases" and has no buttons.
- **No open day:** the page says "Open the business day first" with a link to `/pos`.
- **Day close:** the close screen already shows `cash.cashExpenses`. Add the line "Cash expenses −₹X" to the expected-cash breakdown if it is missing.
- [ ] Tests:
  - Add an expense (body in paise, Idempotency-Key reused after a network failure).
  - The list shows totals and voided rows.
  - Void needs a reason.
  - Categories: Raw material is locked.
  - No open day message.
  - Day report print includes expenses by category.
- [ ] Commit `feat(web): expenses screen and expenses in day close`.

### Task 6: Stock and purchases screens

**Files:**
- Create `apps/web/src/features/stock/{api,keys,queries,mutations,types,index}.ts`.
- Create `components/{StockTable,StockItemForm,PurchaseForm,CountSheet,AdjustSheet,HistorySheet}.tsx`, `pages/StockPage.tsx`, `pages/PurchasesPage.tsx` and tests.
- Modify routes and Home (`/stock`, `/stock/purchases`, `anyOf ['stock.manage']`). The existing `/availability` area keeps its name "Item availability".

**Behaviour:**
- **Stock page:**
  - A banner "N items low on stock" (role=status) when any item is low.
  - A table: name, on hand ("2.5 kg"; negative in red), min level, last rate, and actions Count, Adjust, History, Edit.
  - "Add stock item" form.
- **Count sheet:** shows the current amount; a "Counted" input; Save shows "Difference −0.5 kg recorded".
- **Purchases page:**
  - Today's purchases (vendor, bill ref, total, mode; voided struck), plus "New purchase".
  - The form has vendor, bill ref and paid mode, and line rows (item select, quantity in the item's unit, amount ₹) with add or remove, and a live total.
  - Save uses an Idempotency-Key kept across retries.
  - Void a purchase with a reason.
- [ ] Tests:
  - The low banner and negative on-hand display.
  - Count posts countedMilli parsed from "2.5".
  - The purchase form sends lines in milli and paise, and the total matches.
  - The same key is reused after a failure.
  - Invalid quantity shows "Enter a quantity like 1.5".
  - Void asks for a reason.
- [ ] Commit `feat(web): stock register and purchases screens`.

### Task 7: Sales report screen

**Files:**
- Create `apps/web/src/features/reports/{api,keys,queries,types,csv.ts,index}.ts`, `pages/ReportsPage.tsx`, `components/{RangePicker,SummaryCards,DaysTable,ItemsTable}.tsx` and tests.
- Modify routes and Home (`/reports`, `anyOf ['reports.all']`).

**Behaviour:**
- **Range presets:** Today, Yesterday, This week (Mon–today), This month, Last month, and Custom (two date inputs, IST).
- **Report:**
  - Summary cards: Sales, Bills, Average bill, Expenses, Net.
  - Payment split and Dine-in vs Parcel.
  - Days table (date, bills, total, cash, UPI, card, expenses).
  - Items table (search box; quantity, amount) and categories.
- **CSV:**
  - "Download CSV" builds files in the browser (days.csv, items.csv) from the loaded data, with amounts in rupees.
  - Values are quoted and escape `"`. Cells starting with `= + - @` are prefixed with `'` to block CSV formula injection.
- **Errors:** an error from the server (range too long) is shown.
- [ ] Tests:
  - Presets compute IST dates (fake timers).
  - Summary values render.
  - CSV escaping and formula guard (unit).
  - The download link is created with the right content.
  - A 403 shows "You do not have access".
- [ ] Commit `feat(web): sales report with CSV export`.

## After the last task

Full suite (lint, typecheck, unit, API e2e, builds), final review (fresh reviewer), one fix pass, notes, then merge `feat/m5-back-office` into main locally (no push).
