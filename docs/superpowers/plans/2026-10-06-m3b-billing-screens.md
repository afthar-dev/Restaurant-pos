# M3b Billing Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the restaurant run on it: bill, discount, split, take payment, void, move/merge tables, print bills (browser), close the day with a printed report, and prove backups restore.

**Architecture:** Screens sit on the M3a API. The POS order workspace gains a bill area under the order panel (`service/billing/*`). Every money figure shown comes from the server's bill view; the client never computes tax. Manager approval (pick manager + PIN → override token) becomes one shared component used by dish cancel, discount and void. Bill and day-report printing reuse the M2b iframe printer with two new HTML templates; bill print jobs from the server queue go through the same `PrintWorker`. A new `/day` screen closes the day.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Tailwind 4, Vitest + Testing Library (web); NestJS + Jest e2e for the one API addition; POSIX sh for the restore check.

**Spec:** `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md` (§5.1 steps 6–7, §5.2, §5.4, §5.5, §5.6, §6.1, §6.4 "restore tested at M3", §7, §7.1)

## Global Constraints

- Money is integer paise; show it with `rupees()` from `pages/admin/menu-types`; read rupee input with `parseRupees` / write with `paiseToRupeesInput` from `@rpos/shared`.
- "Totals and taxes computed only on the server; clients send IDs and quantities" (§6.4). The only client-side money maths allowed: `splitEqually` (shared) and cash change preview (`tendered − amount`).
- Composition scheme prints "Bill of Supply" with no tax lines (§4.5) — the server's `title` and empty `taxBreakup` drive this.
- Idempotency key on Add payment (§7): one `crypto.randomUUID()` per payment attempt, kept after a failure, cleared on success (same pattern as Send KOT in `OrderPanel`).
- `If-Match: <bill.version>` on discount changes; on `409 BILL_CHANGED` show the message and refetch.
- POS usable at 1366×768 touch; captain on a 5" phone; touch targets ≥ 44px (`min-h-11`) (§7.1).
- Printing never blocks billing (§5.6.4): a print failure shows a message; the bill stays.
- Permissions (from session): `bill.print`, `payment.take`, `discount.apply`, `discount.unlimited`, `bill.void`, `table.manage`, `day.openClose`, `day.reopen`, `reports.dayClose`. A missing permission hides the action, except where a manager override exists (discount over cap, void), which shows the approval step instead.
- Every user-visible text is plain English for restaurant staff.

## Review Focus

1. **Cash tendered less than the amount** (₹500 handed for ₹732) — the pad must not record it; it shows "₹232 more needed". → Task 4 test.
2. **Double tap on "Record payment" on a slow connection** — one payment only; the retry after a network error reuses the same request id. → Task 4 test.
3. **A bill changed on another counter while the discount sheet is open** — 409 BILL_CHANGED is shown in words and the bill refreshes; no silent overwrite. → Task 3 test.
4. **Closing the day with an unpaid bill or open table** — the screen lists them by table/bill number; the close button is disabled until the list is empty; a 409 from the server re-shows the list. → Task 6 test.
5. **Printing with no bill printer set up** — "Print bill" prints in this browser instead of silently queuing nothing. → Task 2 test.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/src/print/print.service.ts`, `apps/api/src/billing/bills.*` | `buildBillPayload`, `GET /bills/:id/print-payload`, reprint returns job count |
| `apps/web/src/service/types.ts` | `Bill`, `BillLine`, `Payment`, `DayReport`, `CloseCheck` types |
| `apps/web/src/service/queries.ts` | `useOrderBills`, `useCloseCheck`, `useDays`, `useDayReport`, `useOutletSettings` |
| `apps/web/src/realtime/RealtimeProvider.tsx` | `bill.updated` invalidation; `order.updated` also refreshes `['kds']` |
| `apps/web/src/components/ManagerApproval.tsx` | Pick manager + PIN → override token (extracted from `OrderPanel`) |
| `apps/web/src/print/billTicket.ts`, `print/dayReport.ts` | HTML templates |
| `apps/web/src/print/PrintWorker.tsx` | Handles `BILL` jobs |
| `apps/web/src/service/billing/BillArea.tsx` | Bill button(s), bill list, split-by-items picker |
| `apps/web/src/service/billing/BillView.tsx` | One bill: lines, totals, actions |
| `apps/web/src/service/billing/DiscountSheet.tsx` | Bill/item discount with override |
| `apps/web/src/service/billing/PaymentSheet.tsx` | Cash/UPI/card, change, split equally |
| `apps/web/src/service/billing/VoidSheet.tsx` | Void with reason + approval |
| `apps/web/src/service/TableActions.tsx` | Move / merge sheets, "Served" on ready KOTs |
| `apps/web/src/pages/DayPage.tsx` | Close day, report, past days, reopen |
| `apps/web/src/pages/admin/SettingsPage.tsx` | Bag charge field |
| `docker/backup/restore-check.sh`, `docs/deploy.md` | Restore drill script |

---

### Task 1: Billing data on the client, manager approval, bag charge setting

**Files:** Create `apps/web/src/components/ManagerApproval.tsx`, `apps/web/src/components/ManagerApproval.test.tsx`. Modify `apps/web/src/service/types.ts`, `apps/web/src/service/queries.ts`, `apps/web/src/realtime/RealtimeProvider.tsx` (+ its test), `apps/web/src/service/OrderPanel.tsx` (use `ManagerApproval`), `apps/web/src/pages/admin/SettingsPage.tsx` (+ test), `apps/web/src/test/fixtures.ts` (`bill()` fixture).

**Interfaces (produces):**
- Types (mirror `billView` in `apps/api/src/billing/bill.views.ts` exactly): `Discount {kind:'FLAT'|'PERCENT'; value}`, `BillLine {id, orderItemId, itemName, variantName, addons:{name,price}[], unitPrice, quantity, gross, discount: Discount|null, itemDiscount, lineTotal}`, `BillPayment {id, mode, amount, tendered, change, reference, receivedBy:{id,name}, createdAt}`, `TaxRow {cgstBp, sgstBp, taxable, cgst, sgst}`, `Bill {id, billNo, financialYear, status, title, orderId, orderType, tableName, tokenNo, lines, grossSubtotal, itemDiscount, subtotal, discount, billDiscount, discountReason, packaging, taxable, cgst, sgst, taxBreakup, roundOff, total, paid, due, payments, voidReason, version, createdAt, createdBy}`.
- `useOrderBills(orderId)` → `GET /api/orders/:id/bills`, key `['bills', orderId]`, `refetchInterval: POLL_MS`.
- `refreshOrder(client, orderId)` also invalidates `['bills', orderId]`.
- Realtime: `'bill.updated': (p) => [['bills', p.orderId], ['order', p.orderId], ['orders','active'], ['floor']]`; `'order.updated'` adds `['kds']` and `['bills', p.orderId]`.
- `<ManagerApproval permission label onApproved={(token) => …} onCancel />` — lists `GET /api/auth/approvers`, takes a 4–6 digit PIN, calls `POST /api/auth/override {userId, pin, permission}`, shows server errors (wrong PIN / locked) in place, calls `onApproved(overrideToken)`. Buttons: "Approve" and "Back".
- Settings: "Parcel bag charge (₹)" field (`billPackagingCharge`), help text "Added once to each parcel bill."

- [ ] **Step 1: Failing tests.**
  - `ManagerApproval.test.tsx`: renders approvers, refuses a 3-digit PIN locally ("Enter the 4–6 digit PIN"), posts `{userId, pin, permission:'bill.void'}` and calls `onApproved('tok')`; shows "Wrong PIN" from a 401 body message.
  - `RealtimeProvider.test.tsx`: firing `bill.updated {billId:'b1', orderId:'o1'}` invalidates `['bills','o1']`, `['order','o1']`, `['floor']`; `order.updated` invalidates `['kds']`.
  - `SettingsPage` test: typing `10` in "Parcel bag charge (₹)" and saving PATCHes `{ billPackagingCharge: 1000 }`.
  - Existing `OrderScreen.test.tsx` cancel-with-approval tests keep passing after `CancelLineDialog` switches to `ManagerApproval` (labels "Manager" and "Manager PIN" stay).
- [ ] **Step 2: Run** `pnpm --filter @rpos/web exec vitest run src/components src/realtime src/pages/admin src/service` → new tests FAIL.
- [ ] **Step 3: Implement**; keep `ManagerApproval` field ids unique per instance (`useId()`).
- [ ] **Step 4: Run** the same command → PASS; `pnpm --filter @rpos/web typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): billing types, bill realtime, manager approval and bag charge setting`.

### Task 2: Printing bills (template, worker, print from the browser)

**Files:** API: modify `apps/api/src/print/print.service.ts` (extract `buildBillPayload(billId, paperWidthMm): Promise<BillPrintPayload | null>`; `queueBill` returns the job count), `apps/api/src/billing/bills.service.ts` (`reprint` returns `{ id, queued: number }`), `apps/api/src/billing/bills.controller.ts` (`GET /api/bills/:id/print-payload?paperWidthMm=80|58`, `bill.print`), `apps/api/src/billing/billing.module.ts` (import `PrintModule`), `apps/api/test/print.e2e-spec.ts`. Web: create `apps/web/src/print/billTicket.ts` (+ tests in `print.test.tsx`), modify `PrintWorker.tsx`.

**Interfaces:**
- `BillPrintPayload` (web, `print/billTicket.ts`) mirrors the server payload from M3a Task 8 exactly.
- `renderBillTicket(p: BillPrintPayload): string` — standalone HTML, `@page { size: ${w}mm auto }`, all text escaped (reuse `escapeHtml` — move it to `print/escape.ts` and import in both templates). Layout top→bottom: outlet name (bold, centred), address, phone, `GSTIN: …` (only when set), `FSSAI: …`, bill header; title ("Tax Invoice"/"Bill of Supply"); `Bill No: <fy>/<billNo>`, date-time (en-IN), table or `Parcel #token`, guests, cashier; lines (`qty × name (variant)` + add-ons, amount right-aligned); Subtotal; Discount (when > 0) with reason; Packaging (when > 0); per-rate rows `CGST 2.5% on ₹x  ₹y`, `SGST …` (Tax Invoice only); Round off (when ≠ 0); **TOTAL**; payments (`Cash ₹…`), Due (when > 0); footer; a big `VOID` stamp when status is VOID.
- `PrintWorker` prints `BILL` jobs with `renderBillTicket`.
- POS helper `printBill(billId)` in `service/billing/printBill.ts`: `POST /api/bills/:id/print`; when `queued === 0`, `GET /api/bills/:id/print-payload` and `printHtmlInIframe(renderBillTicket(payload))`. Returns `'queued' | 'printed-here'`.

- [ ] **Step 1: Failing tests.**
  - API e2e: with no BILL printer, `POST /bills/:id/print` → `{ queued: 0 }`; `GET /bills/:id/print-payload?paperWidthMm=58` → payload `{ kind:'BILL', paperWidthMm: 58, billNo: 1 }`; another outlet → 404.
  - Web `print.test.tsx`: `renderBillTicket` shows "Tax Invoice", "GSTIN: 29ABCDE1234F1Z5", `CGST 2.5%`, "Round off", "TOTAL", escapes `<b>` in a dish name, shows "Bill of Supply" and no "CGST" for composition, shows "VOID" when void; `PrintWorker` prints a BILL job and reports ok; `printBill` falls back to printing here when nothing was queued (mock `printHtml` via an injectable param `printBill(billId, printHtml = printHtmlInIframe)`).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS): `pnpm --filter @rpos/api test:e2e -- print` and `pnpm --filter @rpos/web exec vitest run src/print src/service`.
- [ ] **Step 5: Commit** `feat(print): bill template, bill jobs in the browser worker and print-here fallback`.

### Task 3: Bill area, bill view, split by items and discounts

**Files:** Create `apps/web/src/service/billing/{BillArea,BillView,SplitSheet,DiscountSheet}.tsx`, `apps/web/src/service/billing/billing.test.tsx`. Modify `apps/web/src/service/OrderWorkspace.tsx` (render `BillArea` under `OrderPanel` when the user has `bill.print`), `apps/web/src/service/OrderPanel.tsx` (hide "Send"/cancel-order once billed; show "Bill printed" status line).

**Behaviour:**
- `BillArea({ order })`:
  - When `order.status` is `OPEN` and every sent dish is unbilled or partly billed: buttons **"Bill"** and **"Split bill"**. If there are unsent dishes: dine-in → buttons disabled with "Send the new dishes to the kitchen first."; parcel → **"Send & bill"** which posts `/kot` (with Idempotency-Key) then `/bills`.
  - "Bill" posts `/api/orders/:id/bills` `{}` with `If-Match: order.version`, then calls `printBill` (Task 2) and shows the new bill.
  - "Split bill" opens `SplitSheet`: each sent dish with a stepper 0…(quantity − billedQuantity); "Bill selected" posts `{ lines }`.
  - Lists the order's bills (from `useOrderBills`), newest first: `Bill 12 · ₹473 · Paid/Unpaid/Void`; the first unpaid bill is expanded.
- `BillView({ bill })`: lines (qty × name, variant/add-ons, line discount), Subtotal, Discount (+reason), Packaging, CGST/SGST rows per rate (or none for Bill of Supply), Round off, **Total**, Paid, **Due**; payments list. Actions (by permission, only while `OPEN`): **Take payment** (Task 4), **Discount** (`discount.apply`, only while no payments), **Print** (always), **Void** (Task 5; shown to `bill.void` holders and, as "Void (manager)", to others with `bill.print`).
- `DiscountSheet({ bill })`: bill discount (₹ flat or %) + optional per-line discount, reason (required when anything > 0). Sends `PUT /bills/:id/discount` with `If-Match: bill.version`; body `{ bill: {kind, value} | null, items: [...changed lines], reason }` (% → bp: `Math.round(percent × 100)`; ₹ → paise via `parseRupees`). On `403 DISCOUNT_OVER_LIMIT` show "This discount needs a manager (cashier limit is ₹X)" and `ManagerApproval` for `discount.unlimited`, then resend with `x-override-token`. On `409 BILL_CHANGED` show the server message and refetch.

- [ ] **Step 1: Failing tests** (`billing.test.tsx`, using `mockApi` + `renderWithProviders`):
  - "bills the order and shows GST totals": POST body `{}`, If-Match header = order version; shows "Tax Invoice", "CGST 2.5%", "Total ₹473", "Due ₹473".
  - "sends unsent parcel dishes before billing": POST `/kot` then `/bills` in that order.
  - "blocks billing a table with unsent dishes": button disabled + hint text.
  - "splits by items": choose 1 of 2 Paneer → POST `{ lines: [{ orderItemId: 'l1', quantity: 1 }] }`.
  - "applies a 10% discount with a reason": PUT body `{ bill: { kind: 'PERCENT', value: 1000 }, items: [], reason: 'Regular guest' }`, header `If-Match: 3`.
  - "asks a manager above the cashier cap": first PUT → 403 `{ code:'DISCOUNT_OVER_LIMIT', allowed: 3900, capBp:1000 }`; approval → override → second PUT carries `x-override-token: tok`.
  - "shows a bill changed elsewhere": PUT → 409 BILL_CHANGED message is shown and GET `/orders/o1/bills` is called again.
  - "hides discount for a waiter": session without `discount.apply` → no "Discount" button.
- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm --filter @rpos/web exec vitest run src/service`), typecheck.
- [ ] **Step 5: Commit** `feat(web): bill the order, split by items and apply discounts`.

### Task 4: Taking payment

**Files:** Create `apps/web/src/service/billing/PaymentSheet.tsx` (+ tests in `billing.test.tsx`). Modify `BillView.tsx`.

**Behaviour:**
- Mode buttons **Cash / UPI / Card** (cash default). Amount field (₹) prefilled with `due`.
- Cash: "Cash received" field + quick buttons `Exact`, and the next round notes above due among ₹100/₹200/₹500/₹2000; shows **Change ₹X** when tendered ≥ amount, "₹Y more needed" (and Record disabled) when less.
- UPI/Card: optional "Reference (UTR / last 4 digits)".
- **Split equally**: "Split between [2–20] people" → `splitEqually(due, n)` parts listed; tapping a part prefills the amount.
- "Record payment" posts `{ mode, amount, tendered?, reference? }` with header `Idempotency-Key` (kept on failure, new after success), guarded against double taps (ref, like Send KOT). Amount above due is blocked client-side ("Only ₹X is due") and server `409 OVERPAYMENT` is shown.
- When the response has `status: 'PAID'`: close the sheet; if the order is now `CLOSED`, the workspace calls `onClosed` (POS returns to the floor) after showing "Bill 12 paid. Table T1 is free." for 2 s (toast via `role=status`).
- Payment needs `payment.take`; without it the button reads "Waiter cannot take payment" (hidden on captain).

- [ ] **Step 1: Failing tests:** cash with change (tendered ₹500 for ₹473 → "Change ₹27", body `{mode:'CASH', amount:47300, tendered:50000}`); short cash blocked ("₹232 more needed" for ₹500 vs ₹732, no POST); split 3 ways of ₹100.00 shows ₹33.34/₹33.33/₹33.33 and pays the first; double tap → one POST; retry after network error reuses the Idempotency-Key; UPI reference sent trimmed; paid bill on a closed order calls `onClosed`.
- [ ] **Step 2–4:** FAIL → implement → PASS; typecheck.
- [ ] **Step 5: Commit** `feat(web): take cash, UPI and card payments with change and equal split`.

### Task 5: Void, move, merge and "served"

**Files:** Create `apps/web/src/service/billing/VoidSheet.tsx`, `apps/web/src/service/TableActions.tsx` (+ `TableActions.test.tsx`). Modify `OrderPanel.tsx` (header actions; KOT "Served" button), `FloorGrid.tsx` (merged tile label), `BillView.tsx`.

**Behaviour:**
- Void: reason (≥ 3 chars) → `POST /bills/:id/void`; users without `bill.void` get `ManagerApproval` for `bill.void` first and send `x-override-token`. `409 TABLE_BUSY` shown in words.
- Move (`table.manage`, dine-in, order OPEN/BILLED): sheet lists **free** tables from `useFloorStatus` grouped by area → `POST /orders/:id/move { tableId }` with `If-Match`.
- Merge (`table.manage`, dine-in, OPEN): sheet lists other **running OPEN dine-in** tables → `POST /orders/:id/merge { fromOrderId }` (this order stays). Order header shows "T1 + T2" from `mergedTables`.
- FloorGrid: a merged table tile reads `T2, with T1` (accessible name) and opens order A.
- KOT header: when `kot.status === 'READY'` show **Served** (`POST /kots/:id/served`), for anyone with `order.take` (M2b deferral, spec §5.1.5).

- [ ] **Step 1: Failing tests:** void with reason as manager; cashier void goes through approval and sends the token; move lists only free tables and posts; merge posts `fromOrderId` and header shows "T1 + T2"; merged floor tile name `T2, with T1`; Served posts to `/api/kots/k1/served`.
- [ ] **Step 2–4:** FAIL → implement → PASS; typecheck.
- [ ] **Step 5: Commit** `feat(web): void bills, move and merge tables, mark dishes served`.

### Task 6: Close the day

**Files:** Create `apps/web/src/pages/DayPage.tsx`, `apps/web/src/pages/DayPage.test.tsx`, `apps/web/src/print/dayReport.ts`. Modify `apps/web/src/routes.tsx` (`/day`, `RequireAuth anyOf={['day.openClose','reports.dayClose']}`), `apps/web/src/pages/Home.tsx` (area "Day close", short "Day", body "Close the day, count cash and see the day report.").

**Behaviour:**
- Top: today's day (from `useBusinessDay`). With `day.openClose`: **Close-check** (`GET /business-day/close-check`): blockers listed — orders as "T1 — order open", "Parcel #4 — bill printed, not paid"; bills as "Bill 12 — ₹473 due". Cash box: Opening, Cash sales, Cash expenses, **Expected in drawer**. "Counted cash (₹)" + note → **Close day** (disabled while blockers exist; confirm bar "Close the day? New orders will be blocked until a manager opens the next day."). A 409 DAY_HAS_OPEN_WORK re-renders blockers from the error body.
- After closing: the report (same component as past days) with **Print report**.
- Past days (`reports.dayClose`): list of last 30 days (date, total, variance coloured red when ≠ 0) → report.
- Report sections: Sales (bills, gross, discounts, packaging, taxable, CGST, SGST, round off, total), Payments (cash/UPI/card), Dine-in vs Parcel, Top items, Voids, Cancelled dishes, Discounts, Expenses (₹0 until M5), Cash (opening, sales, expenses, expected, counted, **variance**).
- Owner (`day.reopen`) on the most recent closed day: **Reopen day** with reason → `POST /business-day/:id/reopen`.
- `renderDayReport(report, outletName, paperWidthMm = 80)` prints the report on the thermal roll via `printHtmlInIframe`.

- [ ] **Step 1: Failing tests:** blockers listed and Close disabled; close posts `{ countedCash: 103000, note: 'Short ₹2' }` and shows variance "−₹2"; 409 re-shows blockers from the error body; past day report opens; owner sees Reopen, manager does not; cashier is refused the route; `renderDayReport` contains "Expected in drawer" and escapes text.
- [ ] **Step 2–4:** FAIL → implement → PASS; typecheck.
- [ ] **Step 5: Commit** `feat(web): close the day with cash count, report and reopen`.

### Task 7: Restore drill

**Files:** Create `docker/backup/restore-check.sh`. Modify `docker/backup/Dockerfile` (copy the script), `docs/deploy.md` (§7 restore drill uses the script).

**Behaviour:** `restore-check.sh <backup-file>` (inside the backup container; PG* env as backup.sh): decrypts `.gpg` with `BACKUP_PASSPHRASE` when needed, creates database `restore_check_<timestamp>`, `pg_restore --no-owner`, prints row counts for `outlets, users, orders, bills, payments, business_days`, compares each with the live database (counts in the backup may be lower, never higher), drops the scratch database (also on failure via `trap`), exits non-zero on any failure. Prints `RESTORE OK` at the end.

- [ ] **Step 1:** Prove it locally against the dev stack: take a backup of `rpos_dev` with `backup.sh --once` (or the equivalent `pg_dump -Fc` in the postgres container), run `restore-check.sh` on it, see `RESTORE OK`; then corrupt a copy (truncate the file) and see a non-zero exit with the scratch database dropped. Paste both outputs into the ledger.
- [ ] **Step 2:** Update `docs/deploy.md` restore drill to one command:
  `docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --entrypoint /usr/local/bin/restore-check.sh backup /backups/<file>`.
- [ ] **Step 3: Commit** `ops: add a restore check that proves a backup loads`.

---

## After the last task

Full suite (`pnpm typecheck && pnpm test && pnpm --filter @rpos/api test:e2e && pnpm format:check`), final whole-branch review (fresh reviewer, most capable model), one fix pass, ledger, overnight notes, merge `feat/m3b-billing-screens` to main, delete the workspace.
