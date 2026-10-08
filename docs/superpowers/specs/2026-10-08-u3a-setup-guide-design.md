# U3a — Setup guide

Part of the UI/UX programme. U3 was split by the user's choice of all four parts into:
**U3a setup guide** (this spec), U3b sales charts, U3c faster admin editing, U3d logo on bills.
Each has its own spec, plan and build.

## 1. Purpose

A new restaurant starts from the seed: outlet "Main Outlet", a "Kitchen" station, 5% GST and
default categories, an owner account and nothing else. Today nothing tells the owner what is
still missing before the first service; they have to know to visit nine Admin tabs.

**Success looks like:**
- After first sign-in, the owner sees "Get your restaurant ready · 0 of 6 done" on the home
  screen and one tap takes them to a guide.
- Each step says in one line why it matters, shows Done / To do / Skipped, and opens the exact
  Admin screen; that screen offers "Back to setup guide".
- Steps tick themselves from real data; nobody marks anything done by hand.
- Optional steps can be skipped with a plain reason and un-skipped.
- When all steps are done or skipped the home card disappears and the guide says the
  restaurant is ready.
- Staff only see steps they are allowed to do. Cashiers and waiters never see the guide.
- No API change.

**Out of scope:** forms inside the guide (it links to the existing Admin screens), sales
charts, admin editing speed-ups, logo upload, syncing skips across devices.

## 2. Steps

Order is the order a new restaurant should work in. "Done" is computed from the listed data.

| # | Step | Permission | Done when | Skip allowed (label) | Opens |
|---|---|---|---|---|---|
| 1 | Restaurant details | `settings.manage` | outlet name is not "Main Outlet" (trimmed, case-insensitive), address and phone are set, and GSTIN is set unless the tax scheme is `NONE` | No | `/admin/settings` |
| 2 | Menu | `menu.manage` | at least one dish in any category | No | `/admin/menu` |
| 3 | Tables and QR stickers | `settings.manage` | at least one table in any area | Yes — "We only do parcels" | `/admin/tables` |
| 4 | Bill printer | `settings.manage` | at least one printer with purpose `BILL` | Yes — "Print bills from this computer's browser" | `/admin/kitchen` |
| 5 | Staff | `users.manage` | at least one active (not archived) staff member who is not the owner and has a PIN | Yes — "I run the counter myself" | `/admin/staff` |
| 6 | This counter | `devices.manage` | at least one active (not revoked) device | No | `/admin/devices` |

Each step carries one sentence of help:
1. "Your name, address, phone and GSTIN print on every bill."
2. "Add the dishes you sell with their prices. Categories decide which kitchen gets the ticket."
3. "Add your dining areas and tables, then print the QR stickers customers scan to order."
4. "Connect the printer for bills. Without one, bills print from the browser's print window."
5. "Give cashiers and waiters their own PIN so every order shows who took it."
6. "Register this computer as the counter so staff can sign in here with their PIN."

## 3. Behaviour

### 3.1 Who sees it
- A step is visible when the user has its permission. The guide (nav entry, page, home card) is
  visible when at least one step is.
- The page route `/setup` is guarded with `RequireAuth anyOf` the union of step permissions.
- Data for a step is only fetched when the step is visible (each query takes `enabled`).

### 3.2 Progress
- `done + skipped` of visible steps counts as complete; the header reads "{n} of {total} done".
- Skipped steps show "Skipped — {label}" and an **Undo** button.
- While any query for a visible step is loading the page shows the loading screen; a query that
  fails shows that step as "Could not check" with a Retry, and it does not count as complete.

### 3.3 Skips
- Stored in this browser under `rpos.setup.skipped` as a JSON array of step ids, read and
  written inside try/catch. Unknown ids are ignored. A skipped step that later becomes done shows
  as Done.

### 3.4 Home card
- On the home page, above the other cards, for users who can see the guide, while the guide is
  not complete: title "Get your restaurant ready", "{n} of {total} done", a progress bar and
  **Continue setup** (link to `/setup`). Hidden when complete. Hidden while loading.

### 3.5 Going to a step and back
- **Set up** links to the step's Admin path with `?from=setup`.
- `AdminLayout` shows a "Back to setup guide" link above the section tabs when the URL has
  `from=setup`. Moving between Admin tabs keeps the link only while on the page reached from
  the guide (the tabs link without the parameter).

### 3.6 Complete
- When complete, the page header description changes to "Ready to serve. Open the day from the
  POS to take the first order." with a **Go to POS** button for users with `bill.print`.
- The nav entry stays, so the guide can be revisited.

## 4. Code

- `features/setup/` — new feature folder:
  - `steps.ts` — step definitions and `setupProgress(input)`, a pure function from data,
    permissions and skipped ids to visible steps with status and the counts. Unit tested.
  - `skipped.ts` — read/write the skip list in `localStorage`, tolerant of errors.
  - `useSetupProgress.ts` — runs the queries for visible steps (via other features' public hooks
    with `enabled`) and calls `setupProgress`.
  - `pages/SetupPage.tsx`, `components/SetupCard.tsx` (home), `index.ts`.
- `useOutlet`, `useMenu`, `useFloorLayout`, `usePrinters`, `useStaff`, `useDevices` gain an
  optional `enabled` (default `true`).
- `app/navigation.ts` — entry "Setup guide" in the Setup group before Admin, with the union of
  step permissions.
- `app/routes.tsx` — `/setup`, lazy like other non-service pages.
- `app/home/HomePage.tsx` — `SetupCard` first.
- `app/admin/AdminLayout.tsx` — the back link.

## 5. Tests

- `steps.test.ts`: each step's done rule (including "Main Outlet" with different case and
  spaces, GSTIN not needed for `NONE`, owner-only staff not counting, archived staff and revoked
  devices not counting, KOT-only printers not counting); permission filtering; skipped counts as
  complete; skipped-then-done shows Done; counts.
- `skipped.test.ts`: round trip, bad JSON, storage throwing.
- `SetupPage.test.tsx`: fresh restaurant shows 0 of 6 and Set up links with `?from=setup`; skip
  and undo; a manager without `users.manage` does not see Staff; complete state with Go to POS;
  axe.
- `HomePage.test.tsx`: card shown for a new owner, hidden when complete, never for a cashier.
- `AdminLayout`: "Back to setup guide" appears with `?from=setup` only.
