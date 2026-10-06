# M4a QR Ordering API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server side of customer QR ordering with staff approval: a customer scans the table sticker, sees the live menu, submits dishes; staff on POS/captain approve (optionally editing) — which sends the KOT — or reject.

**Architecture:** A new `qr` Nest module. The printed sticker carries the table's existing random `qrToken`; scanning it opens a **QR session** (random bearer token, hashed in the DB) bound to that table. Sessions end when the table is vacated (paid, cancelled, voided, moved away) and after 8 hours. A submission is stored as a **QR submission** with its requested lines (validated and snapshotted for the customer's view) — not as order items — so nothing un-approved touches bills, KOTs or totals. A free table gets an empty `PENDING_APPROVAL` order that holds it; approval turns the lines into normal order items through the same code path as staff ordering and then sends the KOT idempotently.

**Tech Stack:** NestJS 11, Prisma 6, Postgres 16, Zod 4 (`@rpos/shared`), Jest e2e.

**Spec:** `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md` (§5.3, §6.1 "Approve QR order", §6.2 "QR customers", §6.4, §7 "Idempotency keys on … Submit QR order")

## Global Constraints

- §5.3: "Menu loads with live availability; unavailable items are hidden." / "Customer submits → a `PENDING_APPROVAL` order (or pending items on the table's running order)." / "Staff review, may edit, then **Approve** (continues from the Send KOT step) or **Reject** (customer sees 'Not accepted — please call the waiter')." / "Submissions are rate-limited per table token."
- §6.2: "QR customers: no login; HMAC-signed table token, rate-limited, rotated on table close."
- §6.4: totals computed only on the server; Zod validation on every request; every query scoped by outlet.
- §7: Submit QR order takes an idempotency key.
- Permission for staff actions: `order.approveQr` (owner, manager, cashier, waiter).
- Money in paise; dine-in prices for QR (QR is dine-in only).

## Review Focus

1. **A photographed sticker used from home** — every submission still needs staff approval, sessions are rate-limited, and a table that is not seated shows the order as a request staff can reject in one tap. → Task 3/4 tests (reject cancels the empty pending order and frees the table).
2. **Two phones at one table submitting at once** — both submissions land on the same pending order; the table is never given two orders. → Task 3 e2e (parallel submits).
3. **An item goes out of stock between submit and approve** — approval fails with the item named, the submission stays pending so staff can edit it, nothing half-applies. → Task 4 e2e.
4. **The table is paid and a new party sits** — the previous party's session no longer works ("Scan the table QR again"). → Task 2 e2e.
5. **A customer taps Submit twice / retries on bad mobile data** — one submission (Idempotency-Key). → Task 3 e2e.

---

## Rulings made in this plan (recorded in the ledger at setup)

- The sticker carries the table's long-lived random `qrToken` (32 random bytes, already in the schema) instead of an HMAC: an unguessable stored token gives the same guarantee without a server-wide secret, and admins can rotate it (Task 5) when a sticker is lost. What rotates on table close (§6.2) is the **session**: a phone that scanned before the table was vacated must scan again. A printed sticker cannot change, so "a photographed old QR stops working" is met for sessions, and remote misuse of a static sticker is contained by staff approval + rate limits. — cost if wrong: add per-sitting tokens printed on table cards.
- QR orders are dine-in only (parcel QR is out of scope for v1).
- A submission onto a table whose bill is already printed (`BILLED`) is refused with "The bill is already printed. Please call the waiter."

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/qr.ts` (+ test) | `qrStartSchema`, `qrSubmitSchema`, `qrApproveSchema`, `qrRejectSchema` |
| `apps/api/prisma/schema.prisma` + migration `20261006180000_qr_ordering` | `QrSession`, `QrSubmission`, `QrSubmissionStatus`; `Order.createdById` nullable |
| `apps/api/src/qr/qr-session.guard.ts` | Public route guard: `x-qr-session` header → `req.qr = { sessionId, outletId, tableId }` |
| `apps/api/src/qr/qr.service.ts` | sessions, public menu, submit, status |
| `apps/api/src/qr/qr-approval.service.ts` | pending list, approve, reject |
| `apps/api/src/qr/qr.controller.ts`, `qr.module.ts`, `end-sessions.ts` | routes; `endQrSessions(tx, tableId)` |
| `apps/api/src/orders/orders.service.ts` | `addLines(tx, order, lines, actorId)` extracted from `addItems` |
| `apps/api/src/common/throttler.guard.ts` | QR requests tracked per session token |
| `apps/api/test/qr.e2e-spec.ts`, `test/qr-helpers.ts` | e2e |

---

### Task 1: Schema and shared contracts

**Interfaces (produces):**
- Shared (`packages/shared/src/qr.ts`, exported from index):
  - `qrStartSchema = z.strictObject({ code: z.string().trim().min(20).max(100) })`
  - `qrSubmitSchema = z.strictObject({ lines: z.array(orderLineSchema).min(1).max(30), note: z.string().trim().max(140).optional() })`
  - `qrApproveSchema = z.strictObject({ lines: z.array(orderLineSchema).min(1).max(30).optional() })` (omit = approve as submitted; given = staff-edited replacement)
  - `qrRejectSchema = z.strictObject({ reason: z.string().trim().max(140).optional() })`
  - `QR_SUBMISSION_STATUSES = ['PENDING','APPROVED','REJECTED'] as const`
- Prisma:
  ```prisma
  enum QrSubmissionStatus { PENDING APPROVED REJECTED }
  model QrSession { id, outletId, tableId, tokenHash @unique, expiresAt, endedAt?, createdAt, updatedAt; @@index([tableId, endedAt]) @@map("qr_sessions") }
  model QrSubmission { id, outletId, tableId, orderId, sessionId, status QrSubmissionStatus @default(PENDING),
    lines Json  /// [{variantId, quantity, addonIds, note?, itemName, variantName, addons:[name], unitPrice}] snapshot for the customer's view
    note String?, total Int /// preview total in paise (dine-in prices + add-ons, before tax)
    decidedById String?, decidedAt DateTime?, rejectReason String?, createdAt, updatedAt;
    @@index([orderId, status]) @@index([outletId, status]) @@index([sessionId, createdAt]) @@map("qr_submissions") }
  ```
  plus relations on Outlet/DiningTable/Order/User; `Order.createdById String?` and `createdBy User?`.
- [ ] Tests: shared schema tests (min/max lines, trimming); `prisma migrate diff` shows no drift; existing e2e still green (orderView handles `createdBy` null — it does not expose it).
- [ ] Commit `feat(qr): QR session and submission schema with shared contracts`.

### Task 2: Sessions, public menu, ending sessions when a table is vacated

**Interfaces:**
- `POST /api/qr/sessions` (public, `@ThrottleAuth()` per IP) body `qrStartSchema` → `{ token, table: { name }, outlet: { name } }`. Unknown/archived table code → `404 QR_UNKNOWN` "This QR code is not in use. Please call the waiter." Creates `QrSession` with `tokenHash = sha256(token)`, `expiresAt = now + 8h`.
- `QrSessionGuard` (public routes): header `x-qr-session`; session must exist, `endedAt null`, `expiresAt > now`, table not archived → else `401 QR_SESSION_ENDED` "Scan the table QR again." Sets `req.qr`.
- `GET /api/qr/menu` (guard) → menu from `MenuService.menu(outletId)` with archived/unavailable items, variants and add-ons removed, categories without items removed, only `dineInPrice` exposed as `price`; shape `{ categories: [{ id, name, items: [{ id, name, foodType, description?, variants: [{ id, name, price }], addonGroups: [{ id, name, minSelect, maxSelect, addons: [{ id, name, price }] }] }] }] }`.
- `endQrSessions(tx, tableId)` in `qr/end-sessions.ts`: if `tableHolder(tx, tableId)` is null, sets `endedAt = now` on the table's open sessions. Called after: `closeOrderIfSettled` closes an order (billing/settle.ts), `OrdersService.cancel`, `KotsService.voidOrder`, `TableMovesService.move` (old table), `QrApprovalService.reject` when it cancels the order (Task 4).
- `RposThrottlerGuard.getTracker`: a request with `x-qr-session` is tracked as `qr:<sha256(token)>`.
- [ ] e2e: start a session with T1's code → token + names; unknown code → 404; menu hides the out-of-stock Veg Soup and the out-of-stock Butter add-on and shows dine-in prices; after the T1 order is paid the old session gets 401 QR_SESSION_ENDED and a new scan works; an expired session (set `expiresAt` in the past) → 401; a session from outlet A cannot read anything from outlet B (menu is the session's outlet).
- [ ] Commit `feat(qr): table QR sessions and the live public menu`.

### Task 3: Submitting and following an order

**Interfaces:**
- `POST /api/qr/orders` (guard; `Idempotency-Key` header) body `qrSubmitSchema` → `QrSubmissionView`. Rules, in one transaction:
  1. Replay: a stored key for this session returns the stored submission (key reused by another session → 409 `IDEMPOTENCY_KEY_REUSED`).
  2. Rate limit: more than 5 submissions by this session in the last 10 minutes, or more than 3 `PENDING` submissions on the table → `429 QR_TOO_MANY` "Please wait for the staff to confirm your order."
  3. Lines validated like staff orders (variant exists in outlet, available, add-ons valid and available) — reuse `OrdersService` validation (extract `validateLines(tx, outletId, lines)` returning the snapshot info); errors keep the staff codes (`ITEM_UNAVAILABLE`, `ADDONS_INVALID`).
  4. Requires the open business day (`requireOpen`) → else `409 DAY_NOT_OPEN` "Ordering is closed right now."
  5. Lock the table row (`SELECT … FOR UPDATE`), then the holder: none → create an order `{ type: DINE_IN, source: QR, status: PENDING_APPROVAL, tableId, guests: null, waiterId: null, createdById: null }` on the open day; holder `PENDING_APPROVAL` or `OPEN` → use it; holder `BILLED` → `409 QR_BILL_PRINTED` "The bill is already printed. Please call the waiter."
  6. Create the submission (`lines` snapshot with dine-in unit price incl. add-ons, `total` = Σ unitPrice × qty) and the idempotency record; emit `qr.submitted { outletId, submissionId, orderId, tableName }` and `order.updated`.
- `QrSubmissionView`: `{ id, status, lines: [{ itemName, variantName, addons: string[], quantity, note, amount }], note, total, createdAt, message }` where `message` is `"Waiting for the staff to confirm"`, `"Accepted — sent to the kitchen"` or `"Not accepted — please call the waiter"`.
- `GET /api/qr/orders` (guard) → this session's submissions, newest first.
- [ ] e2e: free table → `PENDING_APPROVAL` order holds T1 (staff cannot seat T1: 409 TABLE_BUSY) and the submission lists "Paneer Tikka (Half) + Cheese × 2" at ₹420 total; running OPEN table → submission on that order, order stays OPEN, no new order items yet; unavailable dish → 409 ITEM_UNAVAILABLE; billed table → 409 QR_BILL_PRINTED; same Idempotency-Key twice → one submission; two phones (two sessions) submitting in parallel on a free table → exactly one order, two submissions; sixth submission in 10 minutes → 429; day closed → 409.
- [ ] Commit `feat(qr): customers submit orders for staff approval`.

### Task 4: Staff approve or reject

**Interfaces:**
- `GET /api/qr/pending` (`order.approveQr`) → `[{ id, orderId, tableName, createdAt, lines, note, total }]` oldest first, outlet-scoped.
- `GET /api/orders/:id` order view gains `qrPending: QrPendingView[]` (the order's PENDING submissions) so the order screen can show them.
- `POST /api/qr/submissions/:id/approve` (`order.approveQr`) body `qrApproveSchema` → order view. In one `orders.mutate` on the submission's order: lock the submission row (`FOR UPDATE`), must be `PENDING` (`409 QR_ALREADY_DECIDED`); order must be `PENDING_APPROVAL` or `OPEN` (`BILLED` → 409 `ORDER_NOT_OPEN`); a `PENDING_APPROVAL` order becomes `OPEN` with `waiterId = approver`, `guests` unchanged; `orders.addLines(tx, order, lines ?? submitted lines, approver.id)` (validates availability now — an out-of-stock dish throws `ITEM_UNAVAILABLE` and the whole approval rolls back, submission stays PENDING); submission → `APPROVED`, `decidedById`, `decidedAt`. After commit: `kots.send(approver, orderId, undefined, 'qr-' + submissionId)` (idempotent; its result is the response).
- `POST /api/qr/submissions/:id/reject` (`order.approveQr`) body `qrRejectSchema` → order view: submission → `REJECTED` with reason; if the order is `PENDING_APPROVAL` and has no other PENDING submission → order `CANCELLED` (`cancelReason "QR order not accepted"`, `closedAt`) and `endQrSessions` is **not** called (the guests may still be seated and can re-order — staff decide). Emits `order.updated`.
- Realtime gateway forwards `qr.submitted` to the outlet room.
- `OrderPanel`-relevant: `orders.active` includes `PENDING_APPROVAL` orders (already in `ACTIVE_STATUSES`).
- [ ] e2e: approve as submitted → order OPEN, items SENT on a new KOT (KDS shows it), submission APPROVED, customer status "Accepted — sent to the kitchen"; approve with edited lines (one fewer dish) → only the edited lines are on the order; approving twice → 409 QR_ALREADY_DECIDED and still one KOT; item out of stock at approval → 409 ITEM_UNAVAILABLE, submission still PENDING, order unchanged; reject of the only submission on a free table → order CANCELLED, table free, customer sees "Not accepted — please call the waiter"; reject on a running order → order stays OPEN; waiter (has `order.approveQr`) can approve; outlet B staff get 404.
- [ ] Commit `feat(qr): staff approve or reject QR orders`.

### Task 5: Table QR codes for admins

**Interfaces:** `GET /api/tables` already returns tables with `qrToken` to `settings.manage` (verify; if not, add `qrToken` to the admin floor view). Add `POST /api/tables/:id/qr/rotate` (`settings.manage`) → `{ id, qrToken }` new random token (old stickers stop working; sessions of that table end). The QR URL is `${origin}/qr/t/${qrToken}` — built by the web app (M4b).
- [ ] e2e: rotate returns a new token; the old code no longer starts a session; manager without `settings.manage` → 403.
- [ ] Commit `feat(qr): rotate a table's QR code`.

---

## After the last task

Full suite, final whole-branch review (fresh reviewer), one fix pass, ledger, overnight notes, merge `feat/m4a-qr-api`. M4b (separate plan): the customer QR web app (`apps/qr`), the staff pending-orders alert/panel on POS and captain, approve/edit/reject UI, and printable table QR stickers in Admin → Tables.
