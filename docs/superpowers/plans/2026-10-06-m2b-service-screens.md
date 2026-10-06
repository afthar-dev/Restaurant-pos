# M2b Service Screens (POS, Captain, Kitchen Display, Browser Printing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can run service on screen: a manager opens the day; a cashier or waiter opens a table or a parcel order, adds dishes (with sizes, add-ons and notes), sends KOTs; the kitchen screen shows tickets live and moves them to ready; waiters see "ready"; KOTs print from the browser on the device that owns the printer.

**Architecture:** One shared `service` feature in `apps/web` used by both `/pos` (wide layout) and `/captain` (phone layout): `useFloor`, `useOrder`, `useMenu`, `useBusinessDay` React Query hooks; `MenuBrowser`, `ItemPicker`, `OrderPanel`, `FloorGrid` components. Each tap on a dish saves it immediately as a NEW item (no client-side draft), so nothing is lost on refresh. A `RealtimeProvider` opens one Socket.IO connection at `/api/socket.io` (access token + device cookie), invalidates queries on events, and refetches everything on reconnect. `/kds` is device-authenticated (KDS device cookie, no staff sign-in). A `PrintWorker` mounted for registered devices pulls pending print jobs, renders ticket HTML into a hidden iframe, prints, and reports back.

**Tech Stack:** adds `socket.io-client` to web.

**Spec:** §2 (surfaces), §5.1–5.2, §5.6 (printing), §7 (realtime as nudge, network banner, reconnect refetch), §7.1 (KOT to KDS < 1 s; POS 1366×768; captain 5" phone; KDS readable at 2 m).

**Out of scope:** bills, payments, discounts, move/merge/split (M3); QR approvals (M4).

## Global Constraints

- All earlier constraints apply.
- Every write that sends a KOT uses an `Idempotency-Key` (one UUID per tap, reused on automatic retry).
- Screens never trust socket payloads for state: events only invalidate queries.
- Polling fallback: floor and KDS refetch every 15 s even without events.
- Buttons are at least 44 px tall on captain and KDS.
- English copy, plain words ("Send to kitchen", not "Fire KOT").

## Review Focus

1. **Socket drops mid-service** — screens must refetch on reconnect and keep working by polling. Pinned in Task 2 test.
2. **Double tap on Send to kitchen** — one KOT set. Pinned in Task 4 test (same Idempotency-Key, button disabled while sending).
3. **Item with required add-on choice** — cannot be added until the choice is made. Pinned in Task 4 test.
4. **Kitchen screen on a non-KDS device or after revoke** — clear message, no crash. Pinned in Task 6 test.
5. **Printing** — a job is printed once, reported back, and a failed print does not loop forever (stop after 3 attempts). Pinned in Task 7 test.

---

### Task 1: API response gaps for the screens
- Order item view gains `stationId`, `createdAt`; KOT summaries gain `stationId`.
- `GET /api/orders?status=active` validates `status` (only `active`), other values → 400.
- `GET /api/kds/kots?stationId=` validates UUID (400 instead of 500).
- `POST /api/kots/:id/served` only for NEW-type KOTs (CANCEL tickets are dismissed on the kitchen screen); PREPARING→SERVED allowed too.
- Print job `done {ok:false}` marks FAILED after the 3rd failed attempt.
- [ ] Tests first (e2e additions), implement, commit.

### Task 2: Realtime provider and service data hooks
`RealtimeProvider` (socket.io-client, path `/api/socket.io`, `auth.token` from session, `withCredentials`), maps events → query invalidations (`order.updated` → `['order', id]`, `['floor']`, `['orders','active']`; `kot.*` → `['kds']`, `['order', orderId]`; `menu.availability` → `['menu']`; `day.updated` → `['business-day']`); on `connect` after a disconnect → invalidate all. Exposes `useRealtimeStatus()`. Hooks: `useBusinessDay`, `useFloorStatus`, `useActiveOrders`, `useOrder(id)`, `useMenu` (refetchInterval 15 s for floor/orders).
- [ ] Tests first (mock `socket.io-client`): `kot.created` invalidates kds + order; reconnect invalidates everything; token change reconnects.

### Task 3: Day banner, floor and parcel list
`DayGate` component: no open day → managers see "Open the day" with opening cash (₹) → POST; others see "Ask a manager to open the day". `FloorGrid`: areas with table tiles (vacant / running with item count and ₹ subtotal); tap vacant → guests picker (1–12 buttons) → create order → select it; tap running → select. `ParcelList`: "New parcel" + active parcel orders by token.
- [ ] Tests first: manager opens day (paise); waiter sees ask-manager text; tapping vacant T1 → guests 3 → POST `{type:'DINE_IN', tableId, guests:3}`; running table shows "₹60" and "2 items".

### Task 4: Order panel, menu browser and item picker
`MenuBrowser`: category tabs, search, item tiles with food dot and price ("from ₹180"), out-of-stock tiles disabled. Tap → if one variant and no add-on groups → POST item immediately; else `ItemPicker` dialog (variant radio, add-on groups with min/max enforcement, note, quantity) → POST. `OrderPanel`: header (table/token, guests, waiter), NEW lines with − / + / remove, SENT lines grouped by KOT number with status chips, subtotal, "Send to kitchen (n)" button (disabled while sending; Idempotency-Key per click, reused on retry), "Cancel item" on SENT lines → reason + manager PIN dialog (override token → cancel), "Cancel order" for orders without sent items.
- [ ] Tests first: simple item posts directly; Dosa opens picker and blocks "Add" until a chutney is picked; send posts with `Idempotency-Key` header and button disabled during request; + on NEW line PATCHes quantity; cancel SENT item flow requests override then cancel with `x-override-token`.

### Task 5: POS and captain layouts
`/pos`: two columns at ≥1024 px (floor+parcels | order panel+menu). `/captain`: phone flow — table grid → order screen with back button, menu below order; toast "Table T1: KOT 4 is ready" on `kot.updated` READY for orders on the floor.
- [ ] Tests first: captain flow table → add → send; ready toast appears on event.

### Task 6: Kitchen display
`/kds` (no staff sign-in; device cookie): not registered → "Register this screen as a kitchen screen in Admin → Devices"; registered but not KDS → "This device is registered as a counter, not a kitchen screen"; station filter (All / each station, remembered in localStorage); three columns New · Preparing · Ready with ticket cards (KOT no, table/token, minutes since, lines with qty, size, add-ons, note, combo contents); tap advances; CANCEL tickets red with "Dismiss"; large type.
- [ ] Tests first: columns render; Start → PATCH PREPARING; Dismiss on cancel ticket; non-KDS message.

### Task 7: Browser print worker
`renderKotTicket(payload)` → standalone HTML for 58/80 mm (monospace, large KOT no, CANCEL banner). `PrintWorker` (mounted in AppShell and KDS when the browser has a device): loads `/api/print/jobs`, prints each job via an injectable `printHtml(html)` (hidden iframe + `contentWindow.print()`), POSTs done ok/failed, listens for `print.job` events; gives up after 3 failed attempts (server marks FAILED). Admin printer form gains "Printed by device" select.
- [ ] Tests first: ticket HTML contains KOT no, table, lines and CANCEL banner; worker prints pending job once and reports ok; failing print reports `ok:false`; printer form sends `deviceId`.
