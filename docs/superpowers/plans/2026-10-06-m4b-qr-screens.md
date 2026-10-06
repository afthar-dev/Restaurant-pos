# M4b QR Ordering Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers order from their phone after scanning the table sticker; staff see QR requests arrive on POS and captain and approve (optionally edited) or reject them; owners print table QR stickers and replace a lost one.

**Architecture:** The customer app is the existing `apps/qr` Vite app at `/qr/?t=<table code>` — plain React, `fetch`, no router, mobile first. It keeps the session token per table code in `localStorage` (try/catch), polls its requests every 5 s while any is waiting, and restarts the scan when the API answers `QR_SESSION_ENDED`. Staff screens extend `apps/web`: a QR inbox on POS/captain (live via the `qr.submitted` socket event plus polling), a request card inside the order panel with Approve / Edit / Reject, and a sticker sheet in Admin → Tables built with the `qrcode` package (SVG, printed through the existing iframe printer).

**Tech Stack:** React 19, Vite 7, Tailwind 4, Vitest + Testing Library; `qrcode` (web only) for stickers.

**Spec:** `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md` (§5.3, §6.2, §7, §7.1)

## Global Constraints

- §5.3: menu with live availability (server already hides unavailable dishes); "Customer submits"; "Captain app and POS receive an alert"; staff "may edit, then Approve … or Reject (customer sees 'Not accepted — please call the waiter')".
- Customer screen usable on a 5" phone, touch targets ≥ 44 px, large text, works on slow mobile data; no login.
- Submit sends an `Idempotency-Key` that survives a retry of the same cart (§7).
- Money from the server only; the cart preview total uses the menu's prices (labelled "approx., before tax").
- Staff permission `order.approveQr` gates the inbox and the card buttons; `settings.manage` gates stickers.
- Sticker URL: `${window.location.origin}/qr/?t=${qrToken}`.

## Review Focus

1. **Bad mobile data while submitting** — the same request id is reused on retry; one request reaches staff. → Task 2 test.
2. **The table was paid while the phone stayed open** — the next action shows "Scan the table QR again" instead of failing silently. → Task 2 test.
3. **Two staff approve the same request** — the second sees the order (no error, one KOT); the card disappears for both. → Task 1 test (second approve is a 201 replay).
4. **A dish ran out before approval** — the server's message is shown on the card and staff can edit the request. → Task 1 test.
5. **A required add-on group on the customer picker** — Add stays off until the choice is made (same rule as staff). → Task 2 test.

---

### Task 1: Staff side — inbox, request card, approve / edit / reject

**Files:** Modify `apps/web/src/service/types.ts` (`Order.qrPending`, `QrRequest`), `service/queries.ts` (`useQrPending`), `realtime/RealtimeProvider.tsx` (`'qr.submitted' → [['qr-pending'], ['floor'], ['orders','active'], ['order', orderId]]`, and `order.updated` also `['qr-pending']`), `service/OrderPanel.tsx` (PENDING_APPROVAL heading line "QR order waiting for approval", render `QrRequestCard` for each `qrPending`), `service/FloorGrid.tsx` (tile name `T1, QR order waiting` when status PENDING_APPROVAL), `pages/PosPage.tsx` + `pages/CaptainPage.tsx` (render `QrInbox`). Create `service/qr/QrRequestCard.tsx`, `service/qr/QrInbox.tsx`, `service/qr/qr.test.tsx`; fixtures `qrRequest()`.

**Behaviour:**
- `QrInbox({ onOpen })`: hidden when nothing waits or the user lacks `order.approveQr`; otherwise a banner list "T1 · 2 dishes · 2 min ago" (button) → `onOpen(orderId)`. A new arrival (socket `qr.submitted`) also shows a toast "New QR order at T1" (role=status) for 10 s.
- `QrRequestCard({ order, request })`: lines (qty × name (variant), add-ons, note), the customer's note, approx. total; buttons **Approve**, **Edit**, **Reject**.
  - Approve → `POST /api/qr/submissions/:id/approve {}` → refresh order (+ `['qr-pending']`).
  - Edit → steppers per line (0 removes, at least one line must stay); **Approve changes** → `{ lines: [{ variantId, quantity, addonIds, note? }] }`.
  - Reject → optional reason field → `POST …/reject { reason? }`.
  - Errors (e.g. `ITEM_UNAVAILABLE`) shown on the card; buttons guarded against double taps.
- [ ] Tests: inbox lists waiting tables and opens one; toast on `qr.submitted`; card approves as sent (body `{}`), approves an edit (body with changed quantity, removed line dropped), rejects with reason; out-of-stock error shown; hidden without `order.approveQr`; order panel heading for PENDING_APPROVAL; floor tile name.
- [ ] Commit `feat(web): QR inbox and approve, edit or reject requests`.

### Task 2: Customer app

**Files:** `apps/qr/src/{App.tsx, api.ts, session.ts, Menu.tsx, ItemSheet.tsx, Cart.tsx, Requests.tsx, money.ts}` + tests (`App.test.tsx`, `ordering.test.tsx`), `apps/qr/src/test/setup.ts` (fetch stub + localStorage reset).

**Behaviour:**
- No `?t=` → "Scan to order" (existing).
- With a code: `session.ts` reads `rpos.qr.<code>` from localStorage; if missing, `POST /api/qr/sessions { code }` and stores `{ token }`. `404 QR_UNKNOWN` → "This QR code is not in use. Please call the waiter."
- Header: outlet name and "Table T1" (from the session start, stored with the token).
- Menu: category chips + items (name, food-type dot, from-price); tapping an item opens `ItemSheet` (size radio when >1 variant, add-on groups with min/max like staff — Add disabled until required picks — quantity stepper, note ≤ 140) → adds to cart.
- Cart bar at the bottom: "3 dishes · ₹420 approx." → Cart sheet with steppers and an order note → **Send to kitchen staff**: `POST /api/qr/orders` with header `Idempotency-Key` (one UUID per cart; kept on a network failure; new after success), clears the cart, shows Requests.
- Requests list (`GET /api/qr/orders`, polled every 5 s while any is PENDING): each with its status message and lines.
- Any `401 QR_SESSION_ENDED` → forget the stored token and show "Your table was closed. Scan the table QR again." with a "Start again" button (new session).
- `409`/`429` messages from the server shown above the send button.
- [ ] Tests: unknown code message; menu renders and hides nothing extra (server-filtered); required add-on blocks Add; cart total; submit body + Idempotency-Key reused after a network failure; status list shows "Accepted — sent to the kitchen"; session-ended screen and restart.
- [ ] Commit `feat(qr): customers order from the table QR`.

### Task 3: Table QR stickers

**Files:** `apps/web/package.json` (+ `qrcode`, `@types/qrcode`), create `apps/web/src/print/qrStickers.ts` (+ test), modify `apps/web/src/pages/admin/TablesPage.tsx` (+ test).

**Behaviour:**
- Admin → Tables gains "QR stickers": **Print all stickers** → `GET /api/tables/qr` → `renderQrStickers(tables, outletName, origin)` (one 6 × 8 cm card per table: outlet name, big table name, QR SVG from `QRCode.toString(url, { type: 'svg', margin: 1 })`, "Scan to see the menu and order") → `printHtmlInIframe`.
- Per table **New QR code** (confirm "The old sticker for T1 will stop working.") → `POST /api/tables/:id/qr/rotate` → offers **Print this sticker**.
- [ ] Tests: sticker HTML contains each table name and `/qr/?t=<token>` encoded in an SVG, escapes names; rotate asks for confirmation and posts; print-all fetches the codes.
- [ ] Commit `feat(web): print table QR stickers and replace a lost one`.

## After the last task

Full suite, final review (fresh reviewer), one fix pass, notes, merge `feat/m4b-qr-screens`.
