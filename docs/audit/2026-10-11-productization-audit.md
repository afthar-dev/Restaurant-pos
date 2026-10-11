# Productization audit: from one restaurant to many

Date: 11 Oct 2026. Scope: is the Restaurant POS ready to be **sold, installed, onboarded,
supported and updated** for many Indian restaurants by a solo developer? Read-only review of the
repo at commit `29300d4`. Line numbers refer to that commit.

---

## 1. Executive summary

**The product is good; the business around it does not exist yet.** The POS itself (ordering,
KOTs, billing, GST, day close, reports, QR ordering) is well built and well tested: 104 test files,
about 320 API end-to-end cases, CI running format, lint, typecheck, unit, e2e and build
(`.github/workflows/ci.yml:31-38`). The audit on 10 Oct found no Critical bugs in the money flow.

The surprise in its favour: **the data model is already multi-tenant in all but name.** Almost
every business table carries `outlet_id` (`apps/api/prisma/schema.prisma:101-1064`). Every
request's outlet comes from the signed-in user or device, never from the client
(`apps/api/src/auth/access.guard.ts:37-49`). Realtime events go to per-outlet rooms
(`apps/api/src/realtime/realtime.gateway.ts:90-94`). Bill numbers are unique per outlet and
financial year (`schema.prisma:780`). There are already cross-outlet isolation tests in 8 e2e
files (billing, orders, menu, kitchen-tax, print, qr, realtime, users). Sign-in finds the outlet
from the phone number, the device cookie or the QR token, so no subdomain per client is needed.

What is missing is everything a *vendor* needs:

- **Getting a new client in.** No signup or provisioning: the seed assumes one outlet
  (`apps/api/prisma/seed.ts:12-15`). No menu import. No bulk table creation. No platform admin.
- **Getting paid.** No plans, trials, subscription status or suspension.
- **Knowing when something breaks.** No error reporting, uptime alerts or structured logs.
- **Safe updates.** Updates mean `git pull && up --build` on each server (`docs/deploy.md` §9),
  with migrations run automatically at container start (`docker/api.Dockerfile:17`).
- **Outages at the counter.** Billing needs the internet: offline mode is out of scope
  (`docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md:357-359`). For Indian
  restaurants this is the biggest objection a buyer will raise.

**Recommendation:** run it as **one multi-tenant cloud service** (one API, one Postgres, tenant =
outlet, grouped under a new `Organisation`). Make a **4G failover router a condition of sale**.
Build a limited **offline billing fallback** within 3 months. Keep the existing per-box Docker
install only as a paid exception for clients with very poor connectivity. Realistic time to the
first paying client: **about 4–6 weeks of focused solo work** on the "Must" list in §4.

---

## 2. Readiness scorecard

| # | Area | Status | Evidence |
|---|---|---|---|
| 1 | Core POS features | **Green** | Full flow audited 10 Oct with 0 Critical findings (`docs/audit/2026-10-10-audit-report.md`). Money in paise, tax computed only on the server, bills voided and never deleted (README). |
| 2 | Tenant data model | **Green** | `outlet_id` + index on nearly every table (`schema.prisma`). Outlet comes from the token (`access.guard.ts:49`). Per-outlet socket rooms (`realtime.gateway.ts:90`). |
| 3 | Tenant isolation enforcement | **Amber** | Scoping is hand-written: find with `outletId` first, then update by `id` (e.g. `expense-categories.service.ts:91-94`, `bills.service.ts:167-181`). There is no Prisma extension or Postgres RLS as a backstop. Isolation tests cover only 8 of about 30 e2e files. |
| 4 | Deployment model | **Red** for scale | One VPS per restaurant, manual runbook of about an hour (`docs/deploy.md:3`). Images are built on the server (`docker-compose.prod.yml:22-24`, `docker/api.Dockerfile`). No registry and no versioned images. |
| 5 | Tenant provisioning / signup | **Red** | The seed creates or reuses the *first* outlet only (`seed.ts:12-15`). The owner comes from env vars (`.env.prod.example`). No platform-admin role or API. |
| 6 | Onboarding speed | **Amber** | Good: an in-app setup guide with 6 steps (`apps/web/src/features/setup/steps.ts:3`), demo data (`prisma/demo.ts`), a bulk price editor (`menu.controller.ts:86`) and a user manual PDF. Missing: menu CSV/Excel import, bulk table creation (`floor.controller.ts:58` creates one table at a time), menu templates. |
| 7 | Offline resilience | **Red** | Cloud billing stops without internet. The spec says so (`prd-design.md:357-359`). Printing also goes through the server (`print.controller.ts`, `PrintWorker.tsx:17-22`), so KOTs stop too. The only mitigation is "buy a 4G router" (`deploy.md:10`). |
| 8 | Backups | **Amber** | Good: daily `pg_dump`, verified with `pg_restore --list`, GPG-encrypted, with retention (`docker/backup/backup.sh`), plus a one-command restore drill (`restore-check.sh`, `deploy.md` §7). Gaps: RPO is 24 h (a lost day of bills), off-site copy is a manual rclone cron, the media volume is not backed up (`deploy.md` §3a), and nothing alerts when a backup fails (it only writes to stderr). |
| 9 | Monitoring / alerting / error reporting | **Red** | No Sentry or equivalent, no structured logging (about 10 Logger/console calls in all of `apps/api/src`), no uptime check, no metrics. The `api` and `web` containers have no Docker healthcheck (only postgres has one, `docker-compose.prod.yml:13`). `/api/health` exists (`health.service.ts`) but nothing watches it. |
| 10 | Updates / migrations / releases | **Red** | `prisma migrate deploy` runs at container start (`api.Dockerfile:17`). 3 migrations contain DROP/ALTER COLUMN (`20261006180000_qr_ordering`, `20261008170000_media_r2_key`, `20261009120000_no_gst_items`). Every package is version `0.0.0`. No git tags, CHANGELOG or release notes. No CD. Each update means 30–90 s of downtime. |
| 11 | Feature flags / per-tenant settings | **Amber** | Per-outlet settings exist on `Outlet` (name, GSTIN, tax scheme, FSSAI, bill header and footer, logo, discount cap; `schema.prisma:51-74`). No feature flags or plan-gated features. |
| 12 | Support tooling | **Red** | Good: an audit log per outlet (`audit.service.ts`). Missing: platform admin, audited "view as outlet" access, remote diagnostics (app version, device list, print-queue health per outlet), and a way for the client to report a problem. |
| 13 | Auth & app security | **Green/Amber** | Strong: argon2, a 15-minute access JWT plus rotating refresh with reuse grace (`token.service.ts:6`, `session.service.ts:7-15`), httpOnly SameSite=strict cookies (`cookies.ts`), lockout, manager override tokens, helmet, zod validation, per-device throttling (`throttler.guard.ts:14-20`), HTTPS via Let's Encrypt. Gaps: no CSP or HSTS on the static apps served by nginx (`docker/nginx/rpos-locations.conf` sets only Cache-Control), one global `JWT_SECRET` and `User.phone` globally `@unique` (`schema.prisma:103`). |
| 14 | Privacy (DPDP Act 2023) | **Amber** | Little personal data is kept: staff names and phones, plus an optional `customerName` (`schema.prisma:564`). No customer phone numbers are stored today. Missing: privacy notice, terms, data-processing agreement with clients, tenant data export and deletion, retention policy, breach contact. This turns Red the moment CRM, loyalty or WhatsApp (PRD v2) collects customer phones. |
| 15 | Licensing / client billing | **Red** | Nothing. No plan, trial, `paidUntil`, suspension, invoices to clients or GST invoicing of your own subscription. |
| 16 | White-labelling | **Amber** | Per-outlet name and logo on staff header, bills and QR menu (`Outlet.logoId`, `schema.prisma:66-68`). The product name is hard-coded ("Restaurant POS", `apps/web/index.html:7`). No brand per reseller and no custom domain per client. That is fine for a direct-sales SaaS. |
| 17 | Legal | **Red** | No Terms of Service, privacy policy, SLA, refund policy, or GST registration and invoicing for the subscription. |
| 18 | Tests & CI | **Green** | 104 test files, about 320 e2e cases against real Postgres in CI, lint enforces feature boundaries. Missing: coverage reporting, a tenant-isolation sweep, browser/E2E UI tests, load tests. |
| 19 | Performance budget | **Amber** | Main staff bundle 800 KB raw, plus a 370 KB chart chunk (`apps/web/dist/assets`). gzip is on (`rpos-locations.conf:5-11`) and assets cache immutably. The QR app is light (286 KB JS). No size budget in CI. Polling is everywhere (`refetchInterval` in 10+ queries) on top of sockets, which multiplies server load in multi-tenant. |
| 20 | Browser support | **Amber/Red** | Tailwind CSS v4 (`apps/web/package.json:47`) needs Chrome 111+ / Safari 16.4+. Windows 7/8.1 counter PCs stop at Chrome 109, and very old Android WebViews also fall short, so styling breaks there. No browserslist or legacy build. Printing requires Chrome with `--kiosk-printing` (`deploy.md` §6). |
| 21 | Printing reliability | **Amber** | A server-side queue with lease, reprint, and "Print failed / Not printed yet" in the UI (`print.service`, `PrintWorker.tsx`). It depends on a browser tab staying open on the printing PC. `PrinterMode.AGENT` and the agent endpoints exist (`schema.prisma:45-48`, `print.controller.ts`), but **no print agent is built**. There is no ESC/POS, so the thermal output quality depends on the Windows driver. |

**Reds (8):** deployment model at scale, tenant provisioning, offline resilience, monitoring and
error reporting, updates and releases, support tooling, licensing and billing, legal.

---

## 3. Recommended deployment model

### 3.1 Options compared

Costs are rough October 2026 Indian figures. For context, Petpooja-class POS sells at about
₹8–15k per outlet per year, so roughly ₹700–1,250 per month.

| | (a) Box per restaurant (mini-PC on the LAN, Docker) | (b) Cloud VPS per client (managed by you) | (c) Multi-tenant SaaS (one API + one Postgres) |
|---|---|---|---|
| **Your cost per client** | Hardware ₹15–25k one-time (the client buys it) + remote-access tunnel. About ₹0/month hosting. | VPS 2 vCPU/4 GB in Mumbai at ₹1,500–2,500/month + backups storage. **Eats most of the subscription.** | One 8 GB app server + managed Postgres with PITR at about ₹8–15k/month for 100–300 outlets, so **₹40–120 per outlet/month**. |
| **Ops burden (solo)** | Highest: N physical boxes, power cuts, disk failures, dust, someone unplugging it. Site visits. Every update is N remote updates over flaky links. | High: N servers to patch, N cert renewals, N backup crons, N migrations. Scriptable but grows linearly. | Lowest: one deploy, one backup, one dashboard, one cert (wildcard or single domain). |
| **Isolation / security** | Physically isolated. But data sits in a restaurant back room, often without disk encryption, and backups go wherever the client puts them. | Strong: separate DB per client. | Logical isolation via `outlet_id`. **One missed `where outletId` leaks data across clients.** Needs defence in depth (§3.3). |
| **Offline at the counter** | **Best.** LAN keeps billing, KOTs and KDS running without internet. But QR ordering from customers' mobile data, owner reports from home and off-site backups all still need internet or a tunnel. | Same as (c): no internet means no billing. | No internet means no billing **unless** you add a 4G failover and an offline fallback. |
| **Update rollout** | Slowest and riskiest. Boxes may be off; you need an auto-updater (pull signed images) and rollback. | Scripted fan-out (Ansible or a shell loop). Versions drift between clients. | One rollout; everyone on the same version. A bad migration hits everyone at once, so you need expand/contract and backups first. |
| **Fit for this codebase** | Works today (it is the current runbook) | Works today | **About 80% there**: the scoping and tests exist |

### 3.2 Recommendation

**Go with (c) multi-tenant SaaS on one cloud stack.** Make a dual-WAN or 4G failover router a
condition of sale, and add an offline billing fallback in the first 3 months. The codebase already
scopes every query and realtime room by outlet. A solo developer cannot afford the linear ops cost
of (a) or (b) at Indian price points. Offer (a), the same Docker images on a local mini-PC with a
tunnel, only as a paid "on-premise" tier for clients with chronically bad internet, once
auto-update exists.

On offline, be honest in sales. Cloud POS products in India (Petpooja, Posist and others) all handle
outages with either a local or desktop app or an offline queue, and buyers will ask. The minimum
credible answer:

1. **Day one:** a 4G hotspot or dual-WAN router at the counter (₹2–4k).
2. **Within 3 months:** an *offline billing fallback* on the counter PC. A PWA/service worker
   caches the menu. The client computes the bill with the same `bill-calc` logic, which moves to
   `packages/shared`. The bill takes a number from a pre-reserved per-device block. The browser
   prints locally, and the order syncs with an idempotency key when the line returns
   (`IdempotencyKey` already exists, `schema.prisma:708-716`).

### 3.3 Code changes needed for (c)

| # | Change | Why / where | Effort |
|---|---|---|---|
| 1 | **`Organisation` model** (id, legal name, GSTIN for your invoices, contact, plan, status, trialEndsAt, paidUntil). `Outlet.organisationId`. | Billing entity and future multi-outlet chains. One extra relation; no row has to change its `outlet_id`. | S |
| 2 | **Provisioning service + CLI/admin endpoint**: create organisation, outlet, owner, default station, tax rate and expense categories in one transaction. | Replace `seed.ts:12-15` (first outlet only). Reuse its body per outlet. | S |
| 3 | **Platform admin** (separate `PlatformUser` table, its own login, 2FA). List tenants, suspend, extend trial, see usage, and an **audited "view as outlet"** session, read-only by default, written to `AuditEntry` with a reason. | Support without the client's password. | M |
| 4 | **Subscription guard**: a global guard after `AccessGuard` that reads the organisation status. `ACTIVE` or `TRIAL` pass. `PAST_DUE` shows a banner. `SUSPENDED` goes read-only after a grace period. **Never block mid-service**: suspend only at day close or with a 7-day grace. | Plan enforcement. | S |
| 5 | **Defence-in-depth tenant scoping**: a Prisma client extension that injects or verifies `outletId` on models that have it, or Postgres RLS with `SET app.outlet_id` per transaction. Plus a test that, for every controller route, an outlet-B token gets a 404 on outlet-A ids. | Today scoping is by convention only (`expense-categories.service.ts:91-94`). | M |
| 6 | **Uniqueness review**: `User.phone @unique` (`schema.prisma:103`) means a waiter cannot work at two client restaurants, and an owner with two separate businesses cannot use one phone. Move to `@@unique([outletId, phone])` for PIN staff. For password users, keep global or add an outlet picker after login. | Multi-tenant correctness. | M |
| 7 | **Single domain** `app.<brand>.in` (QR at `app.<brand>.in/qr/?t=…`). No subdomains are needed because login, device and QR tokens resolve the outlet. Optional vanity `<slug>.<brand>.in` later with a wildcard cert. | Simplest TLS and CORS (`env.ts:22-30`). | S |
| 8 | **Media keys prefixed by outlet** (`outlets/<id>/…`) in R2, and R2 mandatory in SaaS (no local `media` volume). | Per-tenant export, deletion and quota (`media.service.ts:63`). | S |
| 9 | **Per-outlet feature flags**: `Outlet.features Json` or a `features` table checked by a decorator and exposed to the web app. | Plan gating, gradual rollout. | S |
| 10 | **Migrations strategy**: expand/contract only, no destructive DDL in the same release as the code change. Run `prisma migrate deploy` as a **separate release step** after a fresh backup, not in the container CMD (`api.Dockerfile:17`). Keep a `migrate diff` check in CI. | One bad migration now hits every client. | S |
| 11 | **Scale-out readiness** (later): Socket.IO Redis adapter, Redis throttler storage (both are in-memory today), and fewer polling intervals now that sockets exist. | A single node is fine to about 200–300 outlets. | M |
| 12 | **Tenant data export and deletion**: a per-outlet JSON/CSV dump and a hard-delete job after the contract ends. | DPDP, offboarding, trust. | M |

---

## 4. Prioritised checklist to be "sellable"

Effort: **S** ≤ 2 days, **M** 3–7 days, **L** 2+ weeks (solo).

### Must: before the first paying client

| # | Item | Effort | Notes |
|---|---|---|---|
| M1 | `Organisation` model + provisioning command (org → outlet → owner → defaults) | S | §3.3 #1–2. Replace the single-outlet seed. |
| M2 | Tenant-isolation sweep: Prisma extension or RLS + an automated cross-outlet test over every route | M | The biggest risk in going multi-tenant. |
| M3 | Error reporting (Sentry free tier or GlitchTip) on API, web and QR, tagged with outletId and release | S | Today you would hear about bugs only by phone. |
| M4 | Uptime + backup alerts: external ping on `/api/health` (UptimeRobot or Better Stack), Docker healthchecks for `api` and `web`, backup success sent to a heartbeat URL | S | `backup.sh` only writes to stderr. |
| M5 | Managed Postgres with point-in-time recovery (or WAL archiving to R2 via pgBackRest/wal-g) + automatic off-site copy + monthly restore drill on a calendar | S/M | A 24 h RPO on billing data is not acceptable for a paid product. Keep `restore-check.sh`. |
| M6 | Release pipeline: semver tags, CHANGELOG, CI builds and pushes images to GHCR, deploy pulls the tag (no build on the server), migrations as a separate step after a backup, one-command rollback | M | Replaces `git pull && up --build`. |
| M7 | Subscription status + trial + manual billing: plan, `trialEndsAt` and `paidUntil` on the organisation, a banner, a soft read-only lock with grace. Invoice clients manually (Razorpay payment links or Zoho Invoice) | S | Automate payments later. |
| M8 | Menu import from CSV/Excel (category, item, size, price, tax, veg/non-veg) with a downloadable template and a dry-run preview; bulk "add tables T1–T20" | M | The single biggest onboarding saver. |
| M9 | Legal pack: Terms of Service, privacy policy (DPDP: purpose, retention, grievance officer contact), short data-processing terms, refund policy; your own GST registration if turnover requires; a signup consent checkbox | S | Use a lawyer-reviewed template, about ₹10–20k. |
| M10 | Offline stance for sales: a 4G failover router required in the order form; an in-app banner when offline; a printed one-page "internet down" procedure with a manual bill pad and later entry | S | An honest stopgap until S1. |
| M11 | Browser floor: test on Chrome 109 (Windows 7/8.1) and a cheap Android Go phone. Either require Chrome 111+ in the sales checklist or add PostCSS fallbacks for Tailwind v4 colours (oklch/color-mix) | S | Old counter PCs are common in India. |
| M12 | Security headers on the static apps (CSP, HSTS, X-Frame-Options, Referrer-Policy) in nginx; a secrets rotation note; admin 2FA for the platform console | S | `rpos-locations.conf` sets none. |
| M13 | Support basics: a platform admin page listing tenants with last activity, open day, print-queue failures and version; a WhatsApp support number shown in the app; a minimal audited "view as outlet" | M | §3.3 #3 (a minimal version is fine). |

Must total: about **4–6 weeks** solo.

### Should: within 3 months of launch

| # | Item | Effort |
|---|---|---|
| S1 | **Offline billing fallback** on the counter PC: PWA cache of menu and settings, client-side bill calc from `packages/shared`, per-device reserved bill-number blocks (GST needs unique serials), local print, sync queue with idempotency keys, conflict screen | L |
| S2 | **Print agent** (small Windows tray app or Node service) using the existing `PrinterMode.AGENT` endpoints: ESC/POS over LAN or USB, auto-start, no open browser tab needed | M/L |
| S3 | Self-serve signup + onboarding wizard: restaurant details → menu import or pick a cuisine template → tables → print test → invite staff by PIN → first test bill. Target: first bill in under 30 minutes | M |
| S4 | Online subscription payments (Razorpay Subscriptions or UPI AutoPay) + automatic GST invoices to clients | M |
| S5 | Structured JSON logs (pino) with request id and outletId, shipped to a hosted log service (Better Stack, Grafana Cloud free tier) | S |
| S6 | Per-outlet feature flags + staged rollout (internal outlet → 10% → all) | S |
| S7 | `User.phone` uniqueness change for multi-restaurant staff | M |
| S8 | Tenant data export (CSV/JSON zip) and an offboarding deletion job; data retention policy | M |
| S9 | Performance budget in CI (bundle-size check), lazy-load charts (370 KB chunk), cut polling where sockets already push | S |
| S10 | In-app "What's new" from the CHANGELOG + app version in the footer (helps support) | S |
| S11 | Remote diagnostics per outlet: device last-seen, socket connected, print-job failure rate, browser version, all shown in the platform admin | M |
| S12 | Load test: 200 outlets × 5 devices of polling and sockets on the chosen server size | S |

### Later: 6+ months or when demand appears

| # | Item | Effort |
|---|---|---|
| L1 | On-premise tier (option a) with auto-updating signed images, a tunnel (Cloudflare Tunnel or Tailscale) and cloud backup | L |
| L2 | Multi-outlet UI for chains (central menu, consolidated reports) on top of `Organisation` | L |
| L3 | Socket.IO Redis adapter + Redis throttler; second API node behind a load balancer; zero-downtime blue/green | M |
| L4 | Reseller white-label (brand name, colours, domain per partner) | M |
| L5 | Postgres RLS as a hard guarantee (if M2 used a Prisma extension) | M |
| L6 | Aggregator integrations (Swiggy/Zomato), e-invoicing (IRN) for large clients, regional languages | L |
| L7 | DPDP re-review **before** any CRM, loyalty or WhatsApp feature stores customer phone numbers (consent capture, purpose limits, deletion on request) | M |
| L8 | UI end-to-end tests (Playwright) on POS → KOT → bill → print for the release gate | M |

---

## 5. Onboarding today vs target

**Today: about half a day to a day per client, mostly your time.**

- VPS + DNS + certificate + compose: about 1 h (`deploy.md:3`).
- Settings: about 15 min.
- Menu typed in by hand: 1–4 h for an 80–200 item menu with sizes and add-ons.
- Tables one at a time: about 15 min.
- Staff and devices: about 20 min.
- Printer with Chrome `--kiosk-printing` shortcut and Windows default printer: 30–60 min, often on
  site.

**Target under an hour** (with M1, M8 and S3):

- Provisioning: about 2 min.
- Wizard with details from the GST certificate: 5 min.
- Menu CSV import from the client's existing POS export, a photo of the menu typed into the
  template by you beforehand, or a cuisine template: 10–15 min.
- "Add tables 1–20 in area AC Hall": 1 min.
- Print QR stickers: 5 min.
- Staff PINs: 5 min.
- Register devices: 5 min.
- Print test page with a guided printer check: 10 min.
- First bill: 2 min.

The existing setup guide (`features/setup/steps.ts`) is the right skeleton. Turn its steps into
the wizard.
