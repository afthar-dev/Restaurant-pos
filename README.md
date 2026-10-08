# Restaurant POS

POS, kitchen display, billing, table QR ordering and a light back office for one restaurant
in India. Petpooja-inspired, limited to what a single outlet needs.

- Product spec: `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md`
- Visual PRD: `docs/prd-visual.html`
- Web app architecture and coding rules: `apps/web/ARCHITECTURE.md`
- Deploying to a server (HTTPS, backups, printers): `docs/deploy.md`

## What it does

| Area                           | Who                     | What                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in                        | Everyone                | Owners and managers: phone and password. Cashiers and waiters: PIN on a registered device. Session refresh, lockout after wrong PINs, manager PIN override for restricted actions.                                       |
| POS counter (`/pos`)           | Cashier                 | Floor of tables, parcel orders with token numbers, menu with sizes, add-ons and notes, send KOT, bill, split bill, discounts (cashier cap), payments in cash, UPI or card (split payments), void, move and merge tables. |
| Captain app (`/captain`)       | Waiter                  | The same ordering flow on a phone, plus "food ready" alerts.                                                                                                                                                             |
| Kitchen display (`/kds`)       | Kitchen screen          | Live KOTs per station. New → preparing → ready → served.                                                                                                                                                                 |
| Table QR ordering (`/qr/?t=…`) | Customer                | Scan the table sticker, browse the live menu, send an order. Staff approve, edit or reject it from the POS or the captain app.                                                                                           |
| Printing                       | Counter PC              | KOTs and bills print from the browser (Chrome `--kiosk-printing`), queued per printer, with reprint.                                                                                                                     |
| Day close (`/day`)             | Manager                 | Open the day with opening cash. Close it with a cash count: expected cash is opening + cash sales − cash expenses. Day report printout. The owner can reopen a day.                                                      |
| Stock (`/stock`)               | Owner, manager          | Raw materials with low-stock alerts, physical counts (the difference is recorded), adjustments with a reason, history. Purchases from vendors add stock and book a "Raw material" expense.                               |
| Expenses (`/expenses`)         | Owner, manager, cashier | Expenses on the open day, by category, void with a reason.                                                                                                                                                               |
| Sales report (`/reports`)      | Owner                   | Sales, payments, dine-in vs parcel, dishes, categories, expenses and net over any dates (up to 92 days). CSV export.                                                                                                     |
| Admin (`/admin`)               | Owner, manager          | Menu (categories, items, sizes, add-ons, combos), item availability, tables and QR stickers, kitchen stations and printers, tax rates, staff, devices, outlet settings, audit log.                                       |

Money is stored in paise, tax rates in basis points and stock quantities in thousandths of a
unit. Totals and taxes are computed only on the server. Bills, purchases and expenses are never
deleted, only voided with a reason.

## Layout

| Path              | What                                                     |
| ----------------- | -------------------------------------------------------- |
| `apps/api`        | NestJS API, Prisma, PostgreSQL, Socket.IO realtime       |
| `apps/web`        | React staff app (POS, captain, KDS, back office, admin)  |
| `apps/qr`         | React table-QR menu for customers, served under `/qr/`   |
| `packages/shared` | Zod schemas, money and quantity helpers used by all apps |
| `docker/`         | Production images, nginx, backups                        |

## Requirements

Node 24, pnpm 10.17.1, Docker.

## First run

```bash
pnpm install
docker compose up -d --wait postgres
cp apps/api/.env.example apps/api/.env
pnpm --filter @rpos/shared build
pnpm --filter @rpos/api exec prisma migrate dev
pnpm --filter @rpos/api db:seed
```

To create the first owner, set `OWNER_PHONE` (10-digit mobile) and `OWNER_PASSWORD` (8+
characters) in `apps/api/.env` before running the seed.

## Develop

Run each in its own terminal:

```bash
pnpm --filter @rpos/api dev
pnpm --filter @rpos/web dev
pnpm --filter @rpos/qr dev
```

- Staff app: http://localhost:5173 (sign in at `/login`)
- API health: http://localhost:3000/api/health
- Customer QR app: open a table's link from **Admin → Tables → QR stickers**
  (`http://localhost:5174/qr/?t=<table token>`)

To try the app with a ready-made restaurant (menu, tables, staff, a week of sales), run
`pnpm --filter @rpos/api db:demo` and follow [docs/testing-guide.md](docs/testing-guide.md).

Otherwise, in order: add the menu and tables in Admin, add staff with PINs, register the browser
in Admin → Devices, and open the business day on the POS. Ordering, expenses and purchases
need an open day.

After changing `packages/shared`, rebuild it with `pnpm --filter @rpos/shared build`.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @rpos/api test:e2e
pnpm build
```

`pnpm lint` also enforces the web app's feature boundaries (see `apps/web/ARCHITECTURE.md`).

## Production build (local)

```bash
cp .env.prod.example .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --wait
```

Open http://localhost:8080. Stop with `docker compose -f docker-compose.prod.yml --env-file .env.prod down`.

For a real server with HTTPS and backups, follow `docs/deploy.md`.
