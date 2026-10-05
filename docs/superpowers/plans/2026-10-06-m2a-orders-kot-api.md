# M2a Orders, KOT, Printing & Realtime API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server side of service: a manager opens the business day; staff open dine-in table orders and parcel orders, add items (prices, tax and add-ons snapshotted), send KOTs split by kitchen station, cancel sent items with a manager's approval, and the kitchen moves tickets NEW → PREPARING → READY → SERVED. Print jobs are queued for the right device, and every screen gets realtime nudges.

**Architecture:** New modules `business-day`, `orders`, `kitchen-flow` (KOTs + KDS endpoints), `print`, `realtime`. Every order mutation runs in one transaction that first bumps `orders.version` (row lock + optimistic check). Numbers (KOT, parcel token) come from a `counters` row upserted atomically inside the same transaction, so they are gap-free. Domain events (`@nestjs/event-emitter`) are emitted after commit; the Socket.IO gateway forwards them to rooms (`outlet:{id}`, `station:{id}`, `device:{id}`). Clients treat events as nudges and refetch.

**Tech Stack:** adds `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@nestjs/event-emitter`; `socket.io-client` (tests, web in M2b).

**Spec:** §3.4 (modules/events), §4.2–4.4 (orders, order items snapshot, KOTs, counters, business day), §5.1–5.2 (dine-in, parcel), §5.4 (cancel after KOT), §5.6 (printing), §6.1, §7 (idempotency, optimistic locking, realtime as nudge).

**Out of scope (M2b/M3/M4):** web screens (M2b); bills, payments, discounts, move/merge/split, day close (M3); QR pending orders (M4).

## Global Constraints

- All earlier constraints apply (paise, outlet scoping, archive-not-delete, English, audit for sensitive actions).
- **Business day:** at most one OPEN day per outlet. Orders can only be created while a day is open (`409 DAY_NOT_OPEN`). Opening needs `day.openClose`.
- **Ruling carried from planning:** "open business day" moves into M2 because orders need it; day close stays in M3.
- **Numbering:** KOT numbers and parcel token numbers restart each business day (1, 2, 3…), gap-free. Bill numbers (M3) are per financial year.
- **Snapshots on order items:** item name, variant name, unit price (dine-in or parcel by order type), packaging charge per unit (parcel only), tax rate id + CGST/SGST bp, add-ons `[{id,name,price}]`, combo components `[{itemName,variantName,quantity}]`, station id. Later menu edits never change an order.
- **Optimistic locking:** order mutations accept header `If-Match: <version>`; mismatch → `409 ORDER_CHANGED`. Every successful mutation increments `version` and returns it.
- **Idempotency:** `POST /orders/:id/kot` accepts `Idempotency-Key`; a repeated key returns the first response without creating new KOTs.
- **Permissions:** create order / add items / send KOT / mark served → `order.take`; cancel a SENT item or cancel an order with sent items → `item.cancelAfterKot` (manager override allowed); open day → `day.openClose`. KDS endpoints need a KDS device cookie.
- **Realtime is a nudge:** events carry ids, not full state.

## Review Focus

1. **Two devices act on the same table/order at once** — two waiters opening the same table, or sending KOT simultaneously, must yield one order / one KOT set. Pinned in Task 4/5 concurrency e2e.
2. **Retry after a network blip** — repeating Send KOT with the same Idempotency-Key must not print a second KOT. Pinned in Task 5.
3. **Menu changes after ordering** — price/name/tax edits after an item was added must not change the order. Pinned in Task 4.
4. **Unavailable/invalid choices** — out-of-stock items, archived variants, add-ons outside the item's groups or violating min/max must be refused with a clear code. Pinned in Task 4.
5. **Kitchen sees a cancellation** — cancelling a sent item must produce a CANCEL KOT to the same station and an audit entry with reason and approver. Pinned in Task 5.

---

### Task 1: Shared order schemas
`ORDER_TYPES = ['DINE_IN','PARCEL']`, `ORDER_SOURCES = ['POS','CAPTAIN','QR']`, `ORDER_STATUSES = ['PENDING_APPROVAL','OPEN','BILLED','CLOSED','CANCELLED']`, `ORDER_ITEM_STATUSES = ['NEW','SENT','CANCELLED']`, `KOT_TYPES = ['NEW','CANCEL']`, `KOT_STATUSES = ['NEW','PREPARING','READY','SERVED']`.
Schemas: `openDaySchema {openingCash: price}`; `createOrderSchema` = discriminated union on `type`: `DINE_IN {tableId, guests 1..50}` | `PARCEL {customerName? ≤60}`; `addItemsSchema {items: [{variantId, quantity 1..99, addonIds uuid[] ≤20 unique, note? ≤140}] 1..50}`; `updateOrderItemSchema {quantity? 1..99, note? nullable}` (at least one key); `cancelItemSchema {reason 3..200 trimmed, quantity? 1..99}`; `cancelOrderSchema {reason}`; `kdsStatusSchema {status: 'PREPARING'|'READY'|'SERVED'}`.
Helper `lineTotal({unitPrice, addons, quantity}) = (unitPrice + Σaddon.price) × quantity`.
- [ ] Tests first (orders.test.ts): union picks right branch; DINE_IN needs tableId; duplicate addonIds rejected; empty update rejected; reason trimmed and min 3; lineTotal(18000, [3000,0], 2) = 42000.

### Task 2: Data model
Models: `BusinessDay(outletId, status OPEN|CLOSED, openingCash, openedById, openedAt, closedById?, closedAt?)`; `Counter(outletId, key, period, value)` unique (outletId,key,period); `Order(outletId, businessDayId, type, source, status, tableId?, tokenNo?, guests?, customerName?, waiterId?, createdById, version default 0, cancelReason?, cancelledById?, closedAt?)`; `OrderItem(orderId, itemId, variantId, itemName, variantName, unitPrice, packagingCharge, taxRateId, cgstBp, sgstBp, quantity, addons Json, comboComponents Json, note?, stationId, status, kotId?, cancelReason?, cancelledById?, createdById)`; `Kot(outletId, businessDayId, orderId, kotNo, type, stationId, stationName, status, createdById, readyAt?, servedAt?)`; `KotLine(kotId, orderItemId, itemName, variantName, quantity, addons Json, comboComponents Json, note?)`; `PrintJob(outletId, printerId, deviceId?, kind KOT|BILL, payload Json, status PENDING|PRINTED|FAILED, attempts, printedAt?)`; `IdempotencyKey(outletId, key, response Json)` unique (outletId,key); `Printer.deviceId?` (the browser/agent device that prints it).
- [ ] Migration `orders_kots_printing`; extend test reset; seed unchanged.

### Task 3: Business day and counters
`GET /api/business-day/current` → `{id, openedAt, openingCash, openedBy:{id,name}}` or `null`; `POST /api/business-day/open {openingCash}` (`day.openClose`) → 201; second open while one is OPEN → `409 DAY_ALREADY_OPEN` (outlet row locked FOR UPDATE). `CountersService.next(tx, outletId, key, period): Promise<number>` via `INSERT … ON CONFLICT DO UPDATE SET value = value + 1 RETURNING value`. Audit `day.open`.
- [ ] Tests first: open → current shows it; double open → 409; cashier → 403; concurrent 5 opens → exactly one 201; counter: 20 concurrent `next()` → values 1..20 with no gaps/dupes (unit-ish e2e via service).

### Task 4: Orders and items
- `POST /api/orders` (`order.take`): DINE_IN locks the table row; active order (OPEN/BILLED/PENDING_APPROVAL) on it → `409 TABLE_BUSY {orderId}`; archived/foreign table → 400 INVALID_REFERENCE. PARCEL gets `tokenNo` (counter `TOKEN`, period = business day id). Source from device type (CAPTAIN device → CAPTAIN, else POS). `waiterId` = creator.
- `GET /api/orders/:id` → full order: header, table {id,name}, items (all statuses, with lineTotal), kots summary, `subtotal` (Σ lineTotal of non-cancelled), `version`.
- `GET /api/orders?status=active` → OPEN/BILLED orders of the current day, newest first (compact).
- `GET /api/floor/status` → floor with each table's active order `{orderId, status, guests, itemCount, subtotal, openedAt}` or null.
- `POST /api/orders/:id/items` → validates every line (variant active, item active + available → else `409 ITEM_UNAVAILABLE {itemId}`; add-ons must belong to the item's active groups, be active and available, and satisfy each group's min/max → else `400 ADDONS_INVALID {itemId}`), snapshots, status NEW. Only OPEN orders → else `409 ORDER_NOT_OPEN`.
- `PATCH /api/orders/:id/items/:itemId` and `DELETE …` → only NEW items (else `409 ITEM_ALREADY_SENT`).
- `POST /api/orders/:id/cancel {reason}` → order without SENT items: `order.take`; with SENT items: needs `item.cancelAfterKot` and creates CANCEL KOTs (Task 5 logic). Audit `order.cancel`.
- All mutations: version bump with `If-Match` check.
- [ ] Tests first (orders.e2e-spec): no open day → 409 DAY_NOT_OPEN; dine-in table busy → 409; **two concurrent opens of one table → one 201, one 409**; parcel tokens 1,2,3; add items snapshots dine-in vs parcel price, packaging only for parcel, add-ons with prices; **menu price edited after adding → order unchanged**; unavailable item → 409; add-on from another group → 400; group min not met → 400; stale If-Match → 409 ORDER_CHANGED; floor status shows the running table with subtotal; delete NEW item ok, delete SENT → 409; waiter without device cannot … (covered by auth already).

### Task 5: KOTs and kitchen flow
- `POST /api/orders/:id/kot` (`order.take`, Idempotency-Key): groups NEW items by station → one NEW KOT per station (`kotNo` counter `KOT` per day), lines snapshot, items → SENT with kotId. No NEW items → `409 NOTHING_TO_SEND`. Emits `kot.created`. Creates print jobs (Task 6).
- `POST /api/orders/:id/items/:itemId/cancel {reason, quantity?}`: NEW item → removed (no permission beyond order.take); SENT item → `item.cancelAfterKot`; partial quantity splits the line (remaining SENT, cancelled part CANCELLED); CANCEL KOT to the item's station with the cancelled quantity; audit `order.item.cancel` with reason, actor (approver when overridden) and requester.
- `GET /api/kds/kots?stationId=` (KDS device): today's KOTs with status NEW/PREPARING/READY plus CANCEL KOTs not yet dismissed, oldest first, with order type, table name/token, waiter name, lines.
- `PATCH /api/kds/kots/:id {status}` (KDS device): NEW→PREPARING→READY (NEW→READY allowed); CANCEL KOT: NEW→SERVED (dismiss). Invalid transition → `409 INVALID_TRANSITION`. Emits `kot.updated`.
- `POST /api/kots/:id/served` (`order.take`): READY→SERVED.
- `POST /api/kots/:id/reprint` (`order.take`): new print job.
- [ ] Tests first (kot.e2e-spec): two stations → two KOTs with sequential numbers; second send with no new items → 409; **same Idempotency-Key twice → identical response, KOT count unchanged**; **concurrent sends → exactly one KOT set**; cancel SENT item as waiter → 403, with manager override → CANCEL KOT + audit with reason; partial cancel splits quantities; KDS transitions and invalid transition; KDS endpoints refuse non-KDS device; served by waiter.

### Task 6: Print jobs
On KOT create (NEW or CANCEL) and reprint: one job per active KOT printer of the KOT's station, targeted at `printer.deviceId`. `GET /api/print/jobs` (device cookie) → PENDING jobs for printers assigned to this device; `POST /api/print/jobs/:id/done {ok: boolean}` (device) → PRINTED / FAILED (attempts+1). Printer schema gains optional `deviceId` (validated: active device in outlet). Payload: `{kind:'KOT', kotNo, kotType, stationName, orderType, tableName, tokenNo, waiterName, guests, createdAt, paperWidthMm, lines:[{quantity, itemName, variantName, addons:[name], note, combo:[{itemName,variantName,quantity}]}]}`.
- [ ] Tests first (print.e2e-spec): sending a KOT creates a job for the station printer assigned to device A; device A sees it, device B does not; done → PRINTED; printer with no device → job PENDING with deviceId null; payload contents.

### Task 7: Realtime gateway
Socket.IO at path `/socket.io`. Handshake auth: `{token}` (access JWT) or device cookie `rpos_dt`. Joins `outlet:{outletId}`; devices also join `device:{deviceId}`. Events forwarded from the event emitter: `order.updated {orderId, tableId}`, `kot.created {kotId, orderId, stationId}`, `kot.updated {kotId, orderId, status}`, `print.job {jobId}` (device room only), `menu.availability {itemId|addonId, isAvailable}`, `day.updated {}`. Invalid auth → disconnect with `UNAUTHENTICATED`.
- [ ] Tests first (realtime.e2e-spec, socket.io-client against `app.listen(0)`): user socket receives `kot.created` after send KOT; device socket receives `print.job`; other outlet does not receive; bad token disconnected.
