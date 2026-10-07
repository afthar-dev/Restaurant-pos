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
  The screen's callback runs first (close the form, clear the field). The mutation then stays
  pending until the listed queries have refetched.
- Each refresh is defined once, for example `refreshOrder()`: order, floor, active orders and
  that order's bills.

## Adding a feature

1. Create `features/<name>/` with `types.ts`, `api.ts` and `keys.ts`.
2. Add `queries.ts` and `mutations.ts` hooks. Poll with `POLL_MS` when realtime is not enough.
3. Build components and pages that use only those hooks and `shared/ui`.
4. Export the public pieces from `index.ts`, then wire the route in `app/routes.tsx`.
5. If server notices change this data, add its keys to `features/realtime/invalidations.ts`.
6. Run `pnpm lint && pnpm typecheck && pnpm test`.

## Tooling

- `@/` is `src/`, configured in `tsconfig.json` and `vite.config.ts`.
- `scripts/move-modules.mjs` moves modules and rewrites every import, `vi.mock` and
  `import()` that points at them.
- `scripts/use-feature-index.mjs` points cross-feature imports at each feature's index.
