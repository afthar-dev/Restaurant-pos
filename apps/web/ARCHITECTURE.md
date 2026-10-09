# Web app architecture

The staff app (POS, captain, KDS, day close, admin) is organised by **feature**. Server data
lives in TanStack Query, shared client state in Zustand, and ESLint enforces the boundaries.
The customer QR app (`apps/qr`) follows the same rules at a smaller scale.

## Where state lives

| Kind of state                                                | Tool                                  | Examples                                            |
| ------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------- |
| Server data (anything the API owns)                          | TanStack Query, through feature hooks | orders, bills, menu, floor, QR requests, day report |
| Client state shared across components or kept between visits | Zustand store in the feature          | session token, toasts, KDS station filter           |
| Anything that belongs in the address bar                     | URL search params                     | the selected order on POS and captain               |
| A form's own fields while the user types                     | `useState` in that form               | discount value, cash received                       |

Never copy server data into Zustand or `useState`. Read it from the query and derive the rest.

## Layout

```
src/
  app/            main.tsx, routes, AppShell, admin layout: wires features together
  features/
    <name>/
      api.ts        typed calls to the HTTP client (the only place a URL appears)
      keys.ts       query-key factory, e.g. orderKeys.detail(id)
      queries.ts    useXxx() hooks around useQuery
      mutations.ts  useXxx() hooks around useMutation, with their invalidations
      store.ts      Zustand store for this feature's client state (only if it has any)
      types.ts      the feature's types
      components/   UI pieces;  pages/  route screens
      index.ts      the public API: other code imports only from here
  shared/
    api/          http.ts (apiFetch, ApiError, session refresh), queryClient.ts,
                  useInvalidatingMutation.ts
    session/      the session store (the HTTP client needs the token)
    realtime/     useRealtimeEvent and useRealtimeStatus (the socket lives in features/realtime)
    ui/           one component per file: Field, Sheet, ConfirmBar, ErrorNote, button styles
    lib/          money (rupees), escape
  test/           render helpers, the fetch mock and fixtures
```

## Dependency direction

```
shared ← auth · printing · notifications · health · settings · tax · staff · audit
       ← devices · day · tables
       ← kitchen-setup
       ← menu
       ← orders            (floor, order panel, menu browsing, QR approval)
       ← billing · kitchen
       ← service (POS and captain screens) · realtime (socket and cache refresh)
       ← app
```

A feature may import only features on an earlier line. `pnpm lint` fails on any cycle between
features (`scripts/check-feature-cycles.mjs`), and ESLint enforces the rules below.

## Rules ESLint enforces

1. Code outside a feature imports it only through `@/features/<name>` (its `index.ts`).
2. Only a feature's `api.ts` imports `apiFetch`.
3. Components and pages never import `useQuery`, `useMutation`, `useInfiniteQuery` or
   `useQueryClient`. They call the feature's hooks.
4. `shared/` never imports a feature or `app/`; features never import `app/`.
5. Hook rules (`rules-of-hooks`, `exhaustive-deps`) are errors, and floating promises are
   errors (`void` a promise you mean to ignore).

Tests are exempt from rule 1: they may reach into another feature to set up a screen.

## Query keys

- Every key comes from a factory in `keys.ts`. Never write `['order', id]` by hand.
- Prefixes are deliberate: invalidating `floorKeys.all` (`['floor']`) refreshes the live floor
  and the admin floor layout. Invalidating `kitchenKeys.all` (`['kds']`) refreshes the tickets
  and the station list.
- Realtime notices map to keys in `features/realtime/invalidations.ts`. When you add a query
  that a server notice should refresh, add its key there.

## Mutations

- **Service flows** (orders, billing, day) have a hook per action in `mutations.ts`. Retry
  safety stays inside the hook: the `Idempotency-Key` ref (send KOT, create bill, payment) and
  the "two taps faster than a re-render" guard. Components call `send()`, `pay()` or `decide()`
  and never handle the key themselves.
- **Admin CRUD** uses `useInvalidatingMutation({ mutationFn, invalidates, onSuccess })`.
  The screen's callback runs first (clear the field, close a confirm bar). The mutation then
  stays pending until the listed queries have refetched. Edit forms pass `afterRefresh: true`:
  they close only once the list shows the saved values.
- Callbacks that must run even if the screen closed meanwhile go to the hook, not to
  `mutate(…, { onSuccess })`. TanStack drops per-call callbacks after an unmount.
- Queries do not retry a 4xx answer, except 408 and 429 (`shared/api/queryClient.ts`).
- Each refresh is defined once, for example `refreshOrder()`: order, floor, active orders and
  that order's bills.

## Adding a feature

1. Create `features/<name>/` with `types.ts`, `api.ts` and `keys.ts`.
2. Add `queries.ts` and `mutations.ts` hooks. Poll with `POLL_MS` when realtime is not enough.
3. Build components and pages that use only those hooks and `shared/ui`.
4. Export the public pieces from `index.ts`, then wire the route in `app/routes.tsx`. Export
   pages that service staff do not open first as `lazy(() => import('./pages/…'))` so they
   stay out of the first bundle; the shell's `Suspense` shows the loading screen meanwhile.
5. If server notices change this data, add its keys to `features/realtime/invalidations.ts`.
6. Run `pnpm lint && pnpm typecheck && pnpm test`.

## UI kit (`shared/ui`)

Screens are built from the kit, not from raw Tailwind colours.

- **Colours are tokens** from `app/index.css`: `bg-bg`, `bg-surface`, `bg-surface-2`,
  `border-border`, `border-border-strong`, `text-text`, `text-muted`, `text-subtle`, and the
  `primary-*` scale for actions and selection. Green, amber, red, sky and violet mean success,
  warning, danger, info and QR orders. The kitchen display sets `data-theme="dark"`, which
  redefines the same tokens, so token classes work there unchanged.
- **Appearance:** light and dark follow the device (no in-app switch). Use the tokens or the
  status scales: `bg-red-50 text-red-700`-style pairs invert together in dark (see
  `scripts/dark-palette.mjs`). White text sits only on `primary-700`, `danger-solid` or
  `success-solid`; the amber flag is `warning-solid` with `text-on-warning`.
  `src/app/theme.test.ts` checks the contrast of every pair in use; add new pairs there.
- **Figures** in a row use `StatStrip` (one surface, hairline rules), not a card per number.
- **Every screen starts with `PageHeader`**: a title and one plain sentence on what the screen
  is for. Admin sections use `as="h2"` because the Admin layout owns the h1.
- **Pieces:** `Button`/`IconButton` (`IconButton` needs a `label`), `Card`, `Badge`,
  `StatCard`, `DataTable`, `EmptyState`, `Skeleton`/`LoadingScreen`, `ErrorNote` (pass
  `onRetry`), `Field` with `Input`/`Select`/`Textarea`/`MoneyInput`/`QuantityInput`.
- **Overlays** are Radix: `Dialog` (alias `Sheet`), `ConfirmDialog` for anything destructive,
  `Tabs`, `DropdownMenu`/`MenuItem`, `Tooltip`. They trap focus and close on Escape; dialogs do
  not close on an outside tap unless `dismissOnOutside` is set, so a half-filled form survives
  a stray touch. While a dialog is open, toasts behind it are not announced or clickable;
  they stay on screen and can be read or dismissed after the dialog closes.
- **`cn()` merges conflicts** with `tailwind-merge`: a later class wins (`cn(inputClass,
'w-24')`). Plain template strings do not merge, so pass overrides through `cn`.
- **A crashed or unloadable screen** shows `app/RouteError.tsx` inside the shell, with Reload.
- **Counter keys:** `features/billing/components/useSettleKeys.ts` handles C/U/K/Enter/Esc for
  settling. Any new shortcut must ignore keys typed in fields, keys while a dialog or menu is
  open and Enter on a focused button, the same way.
- **Empty lists explain the next step** with `EmptyState` (icon, title, one sentence), not a
  bare "No items".
- **Touch targets** are at least 44 px (`min-h-11`); money and quantities use `tabular-nums`.
- **Icons** come from `lucide-react` (both apps), stroke 2, at three sizes through `Icon`
  (`sm` 16 px inline with text, `md` 20 px in controls and rows, `lg` 24 px in empty states and
  headers); kit buttons size their icons themselves. An icon beside text is `aria-hidden`; one
  that stands alone gets a `label`. Payment modes use `PaymentIcon`; veg / non-veg / egg use
  `FoodMark`, never a coloured dot.
- **Charts** use Recharts and live in `features/reports/charts/` (the only folder allowed to
  import it, so it stays out of the first bundle). Charts take `ChartPoint[]`, draw colours
  from tokens, put the data in a screen-reader list (`ChartData`) and switch animation off
  under reduced motion. Screens in the first bundle load a chart with `lazy()`.
- **Accessibility tests:** call `expectNoAxeViolations()` from `src/test/a11y.ts` at the end of
  a test that has rendered a full screen.
- **Bundle budget:** the first bundle stays within 45 kB gzip of the pre-kit baseline
  (215 kB JS, 5.5 kB CSS). Check with `pnpm --filter @rpos/web build`.

## Tooling

- `@/` is `src/`, configured in `tsconfig.json` and `vite.config.ts`.
- `scripts/check-feature-cycles.mjs` (run by `pnpm lint`) fails when features import each
  other in a circle.

## The customer QR app (`apps/qr`)

Same rules and lint config, with `qrFetch` as its HTTP client:

- `features/session`: the Zustand session store, saved per table as `rpos.qr.<code>`.
  `end(token)` runs when any call answers `QR_SESSION_ENDED`; the query client reports it
  through `meta: sessionMeta(token)`. A late answer for an older session is ignored.
- `features/cart`: the cart store. Any change drops the cart's `requestId`, so a changed cart
  is a new order, while a resend of the same cart reuses it.
- `features/menu` and `features/requests`: queries keyed by session token. `useMyRequests`
  polls every 5 s only while a request waits for staff, and `useSubmitOrder` sends the cart.
- `app/`: providers, the table screen (start, retry, ended) and the ordering screen.
