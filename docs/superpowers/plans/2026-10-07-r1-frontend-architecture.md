# R1 Frontend Architecture Restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/web` and `apps/qr` structured and consistent before M5: a feature-based layout, one API layer per feature, **TanStack Query for all server state**, **Zustand for client state**, plain `useState` only for a form's own fields, enforced by ESLint. Behaviour does not change; the existing tests (175 web + 10 QR) are the safety net and stay green after every task.

**Why now:** the code grew screen by screen. Today 19 components call `apiFetch` directly, 35 `useQuery` calls build their own keys by hand (`['bills', orderId]`, `['order', id]` … in ~20 files), cache invalidation is repeated per screen, toasts live in two components with their own timers, the QR app keeps the cart and session in component state, and there is no linter.

**Tech stack:** React 19, TanStack Query 5, Zustand 5 (+ `zustand/middleware` persist), Vite path alias `@/`, ESLint 9 flat config with `typescript-eslint`, `eslint-plugin-react-hooks`, and `no-restricted-imports` for feature boundaries.

## Rules (the "clean code" contract)

1. **Where state lives**
   | Kind | Tool | Examples |
   |---|---|---|
   | Server data (anything the API owns) | TanStack Query via feature hooks | orders, bills, menu, floor, QR requests, day report |
   | Shared client state (outlives a component, read in several places) | Zustand store in the feature | session (auth), toasts, KDS station filter, QR cart, QR session token |
   | Address-bar state | URL search params | selected order on POS/captain |
   | A form's own fields while typing | `useState` in that form | discount value, cash tendered |
2. **Layers inside a feature** (`src/features/<name>/`):
   - `api.ts` — typed functions that call the HTTP client. The only place a URL appears.
   - `keys.ts` — the query-key factory (`orderKeys.detail(id)`), so invalidation is never a typo away.
   - `queries.ts` — `useXxx()` hooks wrapping `useQuery` (polling, `enabled`, select).
   - `mutations.ts` — `useXxx()` hooks wrapping `useMutation` with their invalidations/`onSuccess` in one place.
   - `store.ts` — Zustand store(s) for that feature's client state, if any.
   - `components/` — presentational and container components; `pages/` — route components.
   - `types.ts`, `index.ts` — the feature's **public API**; other features import only from `@/features/<name>`.
3. **Shared code** (`src/shared/`): `api/` (HTTP client, `ApiError`, query client factory), `ui/` (one component per file: Button styles, Field, Sheet, ConfirmBar, ErrorNote…), `lib/` (money, dates, escape), `hooks/`. Shared never imports from features.
4. **App wiring** (`src/app/`): providers, router, shell. Features never import from `app/`.
5. **Components** never call `fetch`/`apiFetch` and never write a query key; they use feature hooks.
6. **Naming:** hooks `useNoun`/`useVerbNoun`; mutations named for the action (`useApproveQrRequest`); files PascalCase for components, camelCase otherwise; no default exports.
7. **ESLint enforces:** `react-hooks/rules-of-hooks` + `exhaustive-deps`, `@typescript-eslint/no-floating-promises` (type-aware), no `any`, no imports into another feature's internals, no `apiFetch` import outside `api.ts` files, no imports from `app/` in features or shared.

## Target layout (apps/web/src)

```
app/        App.tsx  providers.tsx  routes.tsx  AppShell.tsx  main.tsx
shared/     api/{http.ts, queryClient.ts}  ui/*  lib/{money.ts, escape.ts, time.ts}  hooks/
features/
  auth/       api keys queries store(session) components(RequireAuth, ManagerApproval) pages(Login, Pin)
  realtime/   RealtimeProvider (invalidations use the key factories)  store(status)
  notifications/ store(toasts)  components/Toaster
  floor/      FloorGrid, TableActions (move/merge)
  orders/     OrderPanel, OrderWorkspace, MenuBrowser, ItemPicker, ParcelList, ReadyAlerts
  billing/    BillArea, BillView, Discount/Payment/Void/Split sheets
  qr/         QrInbox, QrRequestCard
  kitchen/    KdsPage + store(station filter)
  day/        DayGate, DayPage
  printing/   PrintWorker, templates (kot, bill, day report, stickers)
  menu/  staff/  settings/  tables/  kitchen-setup/  tax/  devices/  audit/   (admin features)
```

`apps/qr/src`: `app/` (App, providers), `shared/` (http, money, ui), `features/session/` (store: token per table code, persisted with safe storage; api; queries), `features/menu/` (queries, components), `features/cart/` (Zustand store, components), `features/requests/` (queries with 5 s polling while pending, mutation `useSubmitOrder` keeping the Idempotency-Key in the cart store).

## Tasks

### Task 1: Tooling — ESLint, `@/` alias, scripts
- Add ESLint 9 flat config at the repo root covering `apps/web`, `apps/qr`, `packages/shared` (and `apps/api` with the type-aware rules only). Rules as above; boundary rules start as `warn` until Task 6 turns them to `error`.
- `@/` → `src/` in both apps (`tsconfig` `paths`, `vite.config` `resolve.alias`, vitest inherits).
- Root scripts `lint`, `lint:fix`; CI-equivalent `pnpm lint` added to the "full suite" command used in ledgers.
- Fix every existing lint error (floating promises, hook deps); no behaviour change.
- [ ] `pnpm lint` exits 0; all tests green. Commit `chore: ESLint and path aliases`.

### Task 2: Shared layer
- `shared/api/http.ts` (move `apiFetch`, `ApiError`, refresh logic from `auth/api.ts`; keep exports re-exported from the old path until Task 6 removes it), `shared/api/queryClient.ts` (defaults: retry rules that skip 4xx, `POLL_MS`).
- `shared/ui/*`: split `components/ui.tsx` into files (`buttons.ts`, `Field.tsx`, `Sheet.tsx`, `ConfirmBar.tsx`, `ErrorNote.tsx`, `RenameForm.tsx`, `index.ts`).
- `shared/lib/money.ts` (`rupees`, `paiseInput` helpers now in `pages/admin/menu-types.ts`), `shared/lib/escape.ts`.
- [ ] Tests green, lint clean. Commit `refactor(web): shared api, ui and lib layers`.

### Task 3: Notifications store
- `features/notifications/store.ts` (Zustand): `toasts`, `notify({ text, tone, ttlMs })`, `dismiss(id)`, timers owned by the store; `<Toaster/>` rendered once in `AppShell`.
- `ReadyAlerts`, `QrInbox` (new QR order), paid note in `OrderWorkspace`, print notes use `notify` instead of their own `useState` + `setTimeout`.
- Tests: store unit tests (add, auto-dismiss with fake timers, dedupe by key); existing alert tests unchanged in what they assert.
- [ ] Commit `refactor(web): one toast store and toaster`.

### Task 4: Service features (orders, floor, billing, qr, kitchen, day, printing, realtime)
- Move files into `features/*`; for each feature create `api.ts`, `keys.ts`, `queries.ts`, `mutations.ts` and replace every in-component `apiFetch`/`useMutation`/inline key with feature hooks (e.g. `useCreateBill(order)`, `useAddPayment(bill)` holding the Idempotency-Key ref, `useApproveQrRequest()`).
- `RealtimeProvider` invalidations use the key factories (`orderKeys.detail(id)`, `billKeys.forOrder(id)`…) instead of string arrays.
- KDS station filter → `features/kitchen/store.ts` (Zustand `persist`, safe storage) replacing the hand-written localStorage helpers.
- Realtime connection status → small Zustand store (`useRealtimeStatus` keeps its name).
- [ ] Tests green (import paths updated only), lint clean. Commit per feature group: `refactor(web): orders and floor features`, `…billing and qr`, `…kitchen, day, printing, realtime`.

### Task 5: Admin features
- Same treatment for menu, item editor, add-ons, staff, settings, tables (+ QR stickers), kitchen setup, tax, devices, audit.
- [ ] Commit `refactor(web): admin features`.

### Task 6: Lock it in
- Remove the temporary re-exports; flip boundary rules to `error`; delete empty legacy folders (`service/`, `pages/`, `components/`, `api/`, `auth/` at the root).
- `apps/web/ARCHITECTURE.md`: the rules table, layer diagram, "how to add a feature" checklist, query-key conventions.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green. Commit `refactor(web): enforce feature boundaries and document the architecture`.

### Task 7: Customer QR app
- Add `@tanstack/react-query` and `zustand` to `apps/qr`.
- `features/session/store.ts`: Zustand `persist` (safe storage; falls back to memory in private mode) keyed by table code; `useSession(code)` / `startSession` mutation; `QR_SESSION_ENDED` anywhere → `endSession()` in the store.
- `features/menu/queries.ts` (`useMenu`), `features/requests/queries.ts` (`useMyRequests`, `refetchInterval` 5 s only while one is pending), `features/requests/mutations.ts` (`useSubmitOrder` using the cart store's `requestId`, cleared on success).
- `features/cart/store.ts`: lines, add (merge same dish), set quantity, note, `requestId` (created on first send, kept on failure), `clear()`.
- Components keep their current behaviour; the 10 tests stay green; add store unit tests (merge lines, requestId lifecycle, persistence fallback).
- Same ESLint rules and `@/` alias.
- [ ] Commit `refactor(qr): query and zustand stores, feature layout`.

## Review focus

1. **Nothing behaves differently** — every existing test passes unchanged except import paths; manual smoke of POS → bill → pay, KDS, captain QR approve, customer QR order.
2. **Invalidation parity** — every mutation still refreshes exactly what it refreshed before (key factory mapping table checked against the old string keys).
3. **Persisted stores survive blocked storage** (Safari private mode, cleared site data) without crashing.
4. **No circular imports** between features (lint `import/no-cycle` or a madge check in Task 6).
5. **Bundle size does not grow** beyond the new packages (QR app adds Query + Zustand ≈ 15 kB gzip).

## Out of scope
Backend (`apps/api`) layout is already modular per Nest module; only lint applies there. No visual redesign.
