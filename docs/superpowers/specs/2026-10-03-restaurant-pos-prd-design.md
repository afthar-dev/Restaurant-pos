# Restaurant POS + ERP — Product Requirements & Design

- **Date:** 2026-10-03
- **Status:** Draft for review
- **Type:** Client project (single restaurant, India)
- **Builder:** Solo developer, no hard deadline
- **Stack:** NestJS · Prisma · PostgreSQL · Socket.IO · React (Vite) · pnpm monorepo

---

## 1. Purpose

Build a restaurant management system for one client restaurant in India, covering point of sale, kitchen
flow, billing, a simple back office (stock, expenses, reports), and table-side QR ordering. Feature
inspiration is Petpooja, trimmed to what one restaurant needs to run day to day.

### 1.1 Success criteria

1. The restaurant can run a full service day (open day → dine-in + parcel orders → kitchen → billing → day close) on this system alone.
2. A KOT reaches the kitchen screen in under 1 second and prints in under 2 seconds.
3. Cash at day close reconciles against the system's expected cash, with any variance recorded.
4. No bill can be deleted or renumbered; every void, post-KOT cancel, discount, price edit and day reopen is traceable to a person and a reason.
5. Each milestone ends in a working demo the client can use and give feedback on.

### 1.2 Decisions log (from brainstorming)

| # | Topic | Decision |
|---|---|---|
| 1 | Audience | Client project, one restaurant (single tenant) |
| 2 | Outlets | Single outlet now; data model carries `outlet_id` so more outlets can be added later |
| 3 | Order types | Dine-in (tables) and Parcel (takeaway). No delivery, no Swiggy/Zomato |
| 4 | Kitchen | Printed KOT **and** Kitchen Display Screen (KDS) |
| 5 | Order entry | Cashier POS screen, waiter captain app (phone), customer QR ordering |
| 6 | Hosting | Cloud server (VPS). Client advised to keep a 4G backup router |
| 7 | Tax | India GST, configurable: default 5% (2.5% CGST + 2.5% SGST), composition toggle, GSTIN on invoice |
| 8 | Payments | Cash, UPI and card recorded manually. Payment gateway in v2 |
| 9 | Inventory | Simple stock register (purchases, counts, low-stock alerts). No recipe deduction |
| 10 | CRM | Entirely v2 (customer DB, loyalty, WhatsApp/SMS, feedback). No customer capture in v1 |
| 11 | Staff | Logins + roles in v1. Attendance, payroll and full audit log in v2 |
| 12 | Reports | Sales reports, day close / shift report, expense tracking. GST report deferred to v2 |
| 13 | Menu | Variants, add-ons/notes, separate parcel price + packaging charge, combos, availability toggle |
| 14 | Printing | Browser printing in v1 (Chrome `--kiosk-printing`); switchable per printer to a print agent later |
| 15 | Bill operations | Discounts, split bill, move/merge tables, cancel/void with reason |
| 16 | QR flow | QR orders require staff approval before the KOT fires |
| 17 | Extras accepted | Cashier POS screen confirmed; minimal audit trail in v1 |
| 18 | Language | English only |
| 19 | Team | Solo developer, no deadline |
| 20 | Architecture | Modular monolith; React + Vite (not Next.js); Prisma ORM |

### 1.3 Out of scope for v1

Delivery orders, aggregator integration, payment gateway, print agent, recipe-based stock deduction,
vendor ledger, CRM (customer DB, loyalty, campaigns, feedback), customer phone capture, attendance,
payroll, full audit log, GST report, multi-outlet UI, regional languages, offline mode.

---

## 2. Users and surfaces

| Surface | Users | Device | App |
|---|---|---|---|
| POS counter | Cashier, Manager, Owner | Touchscreen PC / laptop (≥1366×768) | `apps/web` → `/pos` |
| Captain app | Waiters | Android phone (PWA, ≥5") | `apps/web` → `/captain` |
| Kitchen Display (KDS) | Kitchen (paired device) | TV or tablet | `apps/web` → `/kds` |
| Admin / back office | Owner, Manager | PC | `apps/web` → `/admin` |
| QR menu | Customers | Their own phone | `apps/qr` |

---

## 3. Architecture

### 3.1 Mental model

The **order lifecycle** is the spine. Input surfaces create and change orders; orders produce KOTs for
the kitchen and bills for payment. Modules react to domain events instead of calling each other for
side effects, so v2 features plug in as new listeners.

```
 INPUT SURFACES                CORE (NestJS modular monolith)                   OUTPUTS
 POS (cashier)   ─┐
 Captain (waiter)─┼─▶ ORDER ─▶ KOT batch ─▶ BILL(s) ─▶ PAYMENT(s)        ─▶  KDS screen (live)
 QR (customer)   ─┘     ▲          │            │           │                  KOT / bill print
                 MENU ──┤      kot.sent    bill.closed  payment.added          Reports / day close
                 TABLES─┘          └────────────┴───────────┘
                                         ▼
                      Listeners: kitchen · print · audit · reports · (v2: CRM, loyalty)

 BASE: outlet · users/roles · settings · tax · business day
 DATA: one PostgreSQL database, outlet_id on every outlet-scoped row
```

### 3.2 Repository layout

```
restaurant-pos/
├─ apps/
│  ├─ api/      NestJS + Prisma + Socket.IO
│  ├─ web/      React (Vite) PWA: /pos /captain /kds /admin
│  └─ qr/       React (Vite) public table menu
└─ packages/
   └─ shared/   Zod schemas, enums, DTO types, money + tax utilities
```

### 3.3 Technology choices

| Layer | Choice | Reason |
|---|---|---|
| API | NestJS (modular monolith) | One deployable; module boundaries keep it maintainable for a solo dev |
| ORM | Prisma | Best type safety and migrations; reports use `$queryRaw` / SQL views |
| DB | PostgreSQL 16 | Relational integrity for money; row locks for numbering |
| Realtime | Socket.IO (NestJS gateway) | Rooms per outlet / station / table; auto-reconnect |
| Frontend | React + Vite, TanStack Query, Zustand, Tailwind + shadcn/ui | Static SPA, no second server; PWA for captain/KDS |
| Validation | Zod in `packages/shared` | Same schemas on client and server |
| Hosting | One VPS, Docker Compose (api, postgres, nginx), Let's Encrypt | Simple and cheap for one restaurant |
| Monitoring | Sentry (free tier), structured logs with request IDs | Fast diagnosis |

Next.js was rejected: all staff screens are authenticated realtime apps with no SEO need, and it would
add a second Node server beside NestJS.

### 3.4 Backend modules

Each module owns its tables. **Rule:** no module reads or writes another module's tables directly;
it calls that module's service (for reads) or listens to its events (for side effects).

| Module | Owns | Emits / listens |
|---|---|---|
| `auth` | users, roles, sessions, device tokens | — |
| `outlet` | outlet, settings, tax rates, stations, printers | — |
| `menu` | categories, items, variants, add-on groups, add-ons, combos, availability | emits `menu.availability.changed` |
| `tables` | areas, tables, table status, QR tokens | listens `order.*` |
| `orders` | orders, order items, QR pending orders | emits `order.created`, `order.updated`, `kot.sent`, `kot.cancelled` |
| `kitchen` | KOTs, station routing, KDS status | listens `kot.*`; emits `kot.ready` |
| `billing` | bills, bill items, discounts, payments, numbering | emits `bill.printed`, `bill.closed`, `bill.voided` |
| `business-day` | day open/close, cash tally | reads billing + expenses |
| `stock` | stock items, purchases, purchase lines, stock transactions | emits `purchase.created` |
| `expenses` | expense categories, expenses | listens `purchase.created` |
| `reports` | read-only SQL views and queries | reads all |
| `audit` | audit entries | listens to sensitive events |
| `realtime` | Socket.IO gateway and rooms | forwards events to screens |
| `print` | print jobs, printer drivers | listens `kot.sent`, `kot.cancelled`, `bill.printed` |

---

## 4. Data model

### 4.1 Conventions

- UUID primary keys; `created_at`, `updated_at` on every table.
- `outlet_id` on every outlet-scoped table; enforced by a Prisma query extension.
- Money stored as **integer paise**. Tax rates stored as **basis points** (2.5% = 250).
- Master data (menu, tables, users) is archived via `archived_at`, never deleted.
- Bills are never deleted; they can only be voided.
- Mutable aggregates (`orders`, `bills`) carry a `version` column for optimistic locking.

### 4.2 Entities

```
outlet ─┬─ users (role, pin_hash, password_hash)
        ├─ devices (KDS / PRINT_AGENT, station, token_hash)
        ├─ tax_rates (cgst_bp, sgst_bp)
        ├─ stations ── printers (mode BROWSER | AGENT, paper 58/80mm)
        ├─ counters (key: BILL | KOT | TOKEN, financial_year, value)
        ├─ areas ── tables (seats, status, qr_token)
        ├─ categories (station) ── items (food type, tax_rate, is_available, is_combo)
        │                           ├─ item_variants (name, dine_in_price, parcel_price, packaging_charge)
        │                           ├─ item_addon_groups ── addon_groups (min, max) ── addons (price)
        │                           └─ combo_components (combo item → variant, qty)
        ├─ business_days (opening_cash, expected_cash, counted_cash, variance, status)
        │     ├─ orders (type, source, status, table, token_no, waiter, guests, version)
        │     │     ├─ order_items (SNAPSHOT: name, variant, unit_price, tax_bp, addons json, note;
        │     │     │               status, kot_id, cancel_reason)
        │     │     ├─ kots (kot_no, station, type NEW | CANCEL, status)
        │     │     └─ bills (bill_no, fy, status, subtotal, discount, packaging, cgst, sgst,
        │     │           │    round_off, total, void_reason, version)
        │     │           ├─ bill_items (order_item, qty, item_discount)
        │     │           └─ payments (mode CASH | UPI | CARD, amount, tendered, change, ref, received_by)
        │     └─ expenses (category, amount, mode, note, source MANUAL | PURCHASE, purchase_id)
        ├─ expense_categories
        ├─ stock_items (unit, min_level, current_qty)
        │     └─ stock_txns (type PURCHASE | ADJUST | COUNT, qty, rate, ref)
        ├─ purchases (vendor_name, bill_ref, total, paid_mode) ── purchase_lines
        ├─ audit_entries (actor, action, entity, entity_id, reason, before json, after json)
        └─ print_jobs (printer, kind, payload json, status, attempts)
```

### 4.3 State machines

**Order:** `PENDING_APPROVAL` (QR only) → `OPEN` → `BILLED` → `CLOSED`; any non-closed order → `CANCELLED`.

**Order item:** `NEW` (not sent) → `SENT` (on a KOT) → `CANCELLED`. Cancelling a `SENT` item needs manager
permission and a reason, and creates a CANCEL KOT plus an audit entry.

**KOT (KDS):** `NEW` → `PREPARING` → `READY` → `SERVED`.

**Bill:** `OPEN` (printed, unpaid) → `PAID`; `OPEN | PAID` → `VOID` (manager + reason; number retained).

**Table:** `VACANT` → `RUNNING` → `BILL_PRINTED` → `VACANT`.

**Business day:** `OPEN` → `CLOSED`; `CLOSED` → `OPEN` (owner only, audited).

### 4.4 Modelling rules

1. Every item has at least one variant; items without sizes get a single "Regular" variant.
2. Order items snapshot name, price, tax rate and add-ons at the time they are added; later menu edits never change existing orders or bills.
3. **Split by items** creates several bills from one order via `bill_items`. **Split equally** is one bill with N payments, which avoids pro-rating tax.
4. Bill, KOT and token numbers come from `counters`, incremented under a row lock inside the same transaction, so they are unique and gap-free per financial year (April–March).
5. `stock_items.current_qty` is a cache of the sum of `stock_txns`. A physical count posts an `ADJUST` for the difference so variance stays visible.
6. Saving a purchase creates its stock transactions and one expense (category "Raw material") in a single database transaction.
7. Every order and expense belongs to an open business day. Without an open day, the POS prompts the user to open one and blocks ordering.

### 4.5 Bill calculation (server-side only)

```
line_total     = (unit_price + Σ addon_price) × qty − item_discount
subtotal       = Σ line_total
bill_discount  = flat or % of subtotal
packaging      = Σ variant packaging_charge × qty (parcel only) + bill-level packaging (setting)
taxable        = subtotal − bill_discount + packaging
line_taxable   = line_total − pro-rata share of bill_discount + line packaging
                 (bill-level packaging is allocated pro-rata across lines)
cgst, sgst     = Σ line_taxable × line's rate_bp / 10000, rounded to paise per line
                 (0 when outlet tax scheme is COMPOSITION or NONE)
total          = taxable + cgst + sgst, rounded to nearest rupee; difference stored as round_off
```

When the outlet uses the composition scheme, the printed document is titled "Bill of Supply" and
carries no tax lines.

---

## 5. Key flows

### 5.1 Dine-in

1. Waiter (captain) or cashier (POS) taps a table → an `OPEN` order is created and the table becomes `RUNNING`.
2. Items are added with variant, add-ons and notes; they are `NEW`.
3. **Send KOT** groups `NEW` items by station → one KOT per station → `kot.sent` → KDS shows it live and a print job goes to the station printer.
4. Additional items later produce a new KOT containing only the new items.
5. KDS moves the KOT `PREPARING` → `READY`; the waiter's phone receives "Table N ready"; waiter marks `SERVED`.
6. **Print bill** creates the bill; the table becomes `BILL_PRINTED`.
7. Payment(s) recorded → bill `PAID` → order `CLOSED` → table `VACANT`, QR token rotated.

### 5.2 Parcel

1. Cashier starts a parcel order → token number assigned.
2. Items priced at `parcel_price`, packaging charges applied.
3. Send KOT → bill → payment. Default is pay-first; a setting allows pay-at-pickup.
4. When KDS marks `READY`, the token appears in the POS "ready for pickup" list.

### 5.3 QR ordering (staff approval)

1. Customer scans the table QR containing an HMAC-signed table token.
2. Menu loads with live availability; unavailable items are hidden.
3. Customer submits → a `PENDING_APPROVAL` order (or pending items on the table's running order).
4. Captain app and POS receive an alert. Staff review, may edit, then **Approve** (continues from the Send KOT step) or **Reject** (customer sees "Not accepted — please call the waiter").
5. Submissions are rate-limited per table token. The token rotates when the table becomes `VACANT`, so a photographed old QR stops working.

### 5.4 Table and bill operations

| Operation | Behaviour |
|---|---|
| Move table | `order.table_id` changes; old table `VACANT`; KOTs and KDS show the new table |
| Merge tables | Items of order B move to order A; B is `CANCELLED` with note "merged into A"; both tables point to A until closed |
| Split by items | Selected items → separate bill; order closes when every item is billed and paid |
| Split equally | One bill, N equal payments |
| Cancel item after KOT | Manager permission + reason → CANCEL KOT to the same station + audit entry |
| Void bill | Manager permission + reason → bill `VOID`, number kept, audit entry; order reopens for re-billing |
| Discount | Flat or % on bill or item with reason; cashier limited by a configurable % ceiling; audit entry |

### 5.5 Business day and day close

1. **Open day:** manager enters opening cash.
2. During the day all orders, bills, payments and expenses are tagged to the day.
3. **Close day** is blocked while any order is `OPEN` or any bill is unpaid; the blocking list is shown.
4. Expected cash = opening cash + cash payments − cash expenses. Manager enters counted cash; variance is stored.
5. The day-close report prints: sales total, payment-mode split, dine-in vs parcel, top items, voids, cancels, discounts, expenses, cash variance.
6. **Reopen day:** owner only, audited.

### 5.6 Printing

1. A domain event creates a `print_jobs` row for the target printer.
2. **BROWSER driver (v1):** the job is pushed by socket to the device that owns the printer (POS or KDS); it renders a 58/80 mm HTML template and calls `window.print()`. Chrome is launched with `--kiosk-printing` for silent printing to the default printer.
3. **AGENT driver (v2):** a small Node agent on the counter PC connects outbound by socket, converts jobs to ESC/POS, prints to network printers, and acknowledges.
4. The driver is chosen per printer in settings. Unacknowledged jobs stay `PENDING` and show a **Reprint** button. Printing never blocks billing.

---

## 6. Roles, permissions and security

### 6.1 Permission matrix

| Permission | Owner | Manager | Cashier | Waiter | KDS device |
|---|:-:|:-:|:-:|:-:|:-:|
| Take order / send KOT | ✅ | ✅ | ✅ | ✅ | — |
| Approve QR order | ✅ | ✅ | ✅ | ✅ | — |
| Print bill, take payment | ✅ | ✅ | ✅ | setting (off by default) | — |
| Move / merge / split | ✅ | ✅ | ✅ | ✅ | — |
| Discount | any | any | up to configured % | ❌ | — |
| Cancel item after KOT / void bill | ✅ | ✅ | manager PIN override | ❌ | — |
| Open / close day | ✅ | ✅ | ❌ | ❌ | — |
| Reopen day | ✅ | ❌ | ❌ | ❌ | — |
| Menu, prices, tax, tables, printers | ✅ | menu + availability | availability only | availability only | — |
| Stock and purchases | ✅ | ✅ | ❌ | ❌ | — |
| Expenses | ✅ | ✅ | ✅ | ❌ | — |
| Reports | all | day close | ❌ | ❌ | — |
| Users and roles | ✅ | ❌ | ❌ | ❌ | — |
| Update KOT status | — | — | — | — | ✅ |

**Manager PIN override:** a restricted action on a cashier screen can be authorised by a manager typing
their PIN; the action is executed and audited as the manager.

### 6.2 Authentication

- Owner and Manager: phone + password.
- Cashier and Waiter: 4–6 digit PIN on a registered device; lockout after 5 failed attempts.
- Tokens: 15-minute access JWT + rotating httpOnly refresh cookie.
- Devices (KDS, print agent): paired from Admin with a one-time code → long-lived, revocable device token.
- QR customers: no login; HMAC-signed table token, rate-limited, rotated on table close.

### 6.3 Audit trail (v1 minimal)

Recorded actions: bill void, item cancel after KOT, discount, menu price edit, day reopen, manager PIN
override. Each entry stores actor, action, entity, reason, before/after snapshot and timestamp.

### 6.4 Security baseline

- Totals and taxes computed only on the server; clients send IDs and quantities.
- Zod validation on every request using shared schemas.
- NestJS guards enforce permissions per route; Prisma extension scopes every query by `outlet_id`.
- HTTPS via nginx + Let's Encrypt; Helmet headers; CORS limited to the app domains; rate limits on auth and QR endpoints.
- Passwords and PINs hashed with argon2.
- Nightly encrypted `pg_dump` to offsite storage, 30-day retention; restore tested at M3.

---

## 7. Reliability and error handling

- **Idempotency keys** on Send KOT, Add payment and Submit QR order, so retries never duplicate.
- **Optimistic locking** on orders and bills; a conflicting edit returns `409 ORDER_CHANGED` and the client refetches.
- **Realtime is a nudge, not the source of truth:** on socket reconnect, every screen refetches its state.
- **Network-down banner** on all screens; actions that need the server are disabled with a clear message.
- **Print failures** are queued with Reprint; billing continues.
- **Error shape:** `{ code, message, details }`, logged with request ID; Sentry for frontend and backend.

### 7.1 Non-functional targets

| Target | Value |
|---|---|
| KOT to KDS | < 1 s |
| Bill print | < 2 s |
| Capacity | 50 tables, ~500 bills/day on a 2 vCPU / 4 GB VPS |
| POS screen | Usable at 1366×768 touch |
| Captain app | Usable on a 5" phone |
| KDS | Readable from 2 m on a TV |

### 7.2 Operational recommendation to client

Cloud hosting means billing depends on internet. The client should keep a 4G backup router at the
counter. Offline mode is out of scope.

---

## 8. Testing strategy

| Level | Scope | Tooling |
|---|---|---|
| Unit | Tax and totals, discount limits, split, numbering, day-close maths, state machines | Vitest / Jest, TDD, 100% branch coverage on billing + tax |
| Integration | Each module against real Postgres; order → KOT → bill → payment → close | NestJS testing + Testcontainers |
| E2E | Dine-in, parcel, QR approve, split + void, day close | Playwright |

---

## 9. Milestones

Each milestone ends in a client demo.

| M | Delivers | Client demo |
|---|---|---|
| M0 | Monorepo, Docker Compose, CI, auth (password + PIN), roles, outlet settings, VPS deploy | Staff can log in online |
| M1 | Menu (variants, add-ons, combos, parcel price, availability), areas/tables, tax setup, stations/printers config | Client enters real menu |
| M2 | Orders (dine-in + parcel), KOT + KDS realtime, browser printing, captain PWA | Kitchen flow live |
| M3 | Billing: discounts, split, move/merge, cancel/void, payments, audit trail, business day + day close, backups verified | **Restaurant can run on it** — soft launch |
| M4 | QR ordering with staff approval | Customers order from table |
| M5 | Stock register, purchases → expenses, expense tracking, sales reports | Owner back office |
| v2 | CRM, loyalty, WhatsApp/SMS, feedback, customer capture, attendance, payroll, full audit log, payment gateway, print agent, GST report, multi-outlet UI | — |

Each milestone gets its own implementation plan (and a focused spec if its design needs more detail
than this document).

---

## 10. Open items to confirm with the client

1. GST certificate: GSTIN and scheme (regular vs composition).
2. Table list and areas (e.g. AC hall, outdoor) and seat counts.
3. Full menu with variants, add-ons, parcel prices and packaging charges.
4. Kitchen stations needed (single kitchen vs separate counters).
5. Cashier discount ceiling and whether waiters may collect payment.
6. Parcel payment timing: pay first or pay at pickup.
7. Printer hardware (58 mm vs 80 mm; USB vs network) and KDS screen.
8. Bill header/footer text, logo, FSSAI licence number to print.
