# U1 Design System and App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every staff screen in `apps/web` a consistent, accessible, production-grade look:
- design tokens;
- a component kit on Radix primitives;
- a role-aware app shell with day and connection status;
- a role home dashboard;
- every page restyled onto it.

Behaviour does not change.

**Architecture:** Tokens live in `app/index.css` (Tailwind 4 `@theme`). Components live in `shared/ui`, one file each. The shell is in `app/` (`navigation.ts`, `AppLayout`, header parts, `HomePage`). Pages keep their data hooks and only change markup.

The existing class-string exports (`primaryButton`, `inputClass`…) are restyled first, so untouched pages improve at once and the move to components can go page by page.

**Tech Stack:** React 19, Tailwind 4, `@radix-ui/react-{dialog,alert-dialog,dropdown-menu,tabs,tooltip,slot}`, `lucide-react`, `@fontsource-variable/inter`, `vitest-axe`.

**Spec:** `docs/superpowers/specs/2026-10-07-u1-design-system-design.md`

## Global Constraints

- **Behaviour:** behaviour, routes, hooks, API calls and test assertions on accessible names do not change. Selectors change only where an inline confirm becomes a dialog.
- **Accessibility:** touch targets ≥ 44 px (`md` controls), visible focus ring, AA contrast, and status never shown by colour alone.
- **Imports:** components import only `@/shared/ui` (lint boundaries already enforce feature rules).
- **Bundle:** the U1 additions stay within ≤ 45 kB gzip (measure with `pnpm --filter @rpos/web build` before and after).

## Review Focus

1. **Dialogs on phones and with keyboards.** Focus moves into the dialog, Escape closes it, and focus returns to the opener. The same `label` and `onClose` contract as the old `Sheet`, so every flow that opens a sheet still works. → Task 3 tests.
2. **Navigation shows only permitted areas,** and a cashier's home never asks for owner-only data. Owner-only queries must not fire for other roles, otherwise a 403 shows up as an error card. → Tasks 4 and 5 tests.
3. **POS at 1366×768.** The sidebar collapses, so the order and menu columns stay usable. → Task 6 screenshot check.
4. **KDS stays readable from 2 m.** Dark theme, no chrome, contrast ≥ AA. → Task 6 screenshot plus axe.
5. **Day-closed state is obvious.** The header pill says "Day not open", with an "Open day" link for managers. → Task 4 test.

---

### Task 1: Tokens, fonts, dependencies, test shims
- Add dependencies (web): `@radix-ui/react-dialog @radix-ui/react-alert-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-slot lucide-react @fontsource-variable/inter`. Dev: `vitest-axe`.
- `app/index.css`:
  - `@import '@fontsource-variable/inter'`;
  - `@theme` with semantic tokens: `--color-bg/surface/surface-2/border/text/muted`, `--color-primary-{50…900}` (orange), plus success, warning, danger, info and violet soft and strong;
  - `--font-sans: 'Inter Variable'`, radii and shadows;
  - remap `--color-slate-*` to stone values, so existing neutrals turn warm;
  - a `[data-theme='dark']` block for the KDS;
  - a global `:focus-visible` ring and `body { background: var(--color-bg) }`.
- `test/setup.ts`: shims for `ResizeObserver`, `Element.prototype.hasPointerCapture`, `scrollIntoView` and `DOMRect`, which Radix needs in jsdom.
- [ ] Build passes; all tests green. Commit `feat(web): design tokens, Inter font and UI dependencies`.

### Task 2: Basic components
- Restyle `styles.ts` constants onto the tokens: `primaryButton` = primary orange; `inputClass` = 44 px tall with a token border and focus ring.
- New files:
  - `Button.tsx` (variants, sizes, `loading`, `icon`, `asChild` via Radix Slot) and `IconButton.tsx`;
  - `Input.tsx`, `Textarea.tsx`, `Select.tsx`, `MoneyInput.tsx`, `QuantityInput.tsx`;
  - `Card.tsx`, `PageHeader.tsx`, `Badge.tsx` (`StatusPill`), `StatCard.tsx`, `DataTable.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `Spinner.tsx`;
  - `ErrorNote` restyled as an alert with an icon and an optional `onRetry`; `LoadingScreen` becomes a skeleton block.
- Tests in `shared/ui/ui.test.tsx`: Button `loading` (disabled, `aria-busy`, spinner), `asChild` renders a link, IconButton needs a label, DataTable empty slot, StatusPill renders icon and text, ErrorNote retry.
- [ ] Commit `feat(web): component kit basics`.

### Task 3: Overlays and feedback (Radix)
- `Dialog.tsx`: Radix Dialog with the same props as the old `Sheet` (`label`, `onClose`, `children`); centred card on ≥ 640 px, bottom sheet on smaller screens. `Sheet` re-exports `Dialog`, so all 18 users switch at once.
- `ConfirmDialog.tsx` (AlertDialog), `Tabs.tsx`, `DropdownMenu.tsx`, `Tooltip.tsx`.
- `Toaster` restyled with tone icons (lucide).
- Tests: Dialog focus moves in, Escape calls `onClose`, focus returns to the opener; ConfirmDialog confirm and cancel.
- [ ] Full web suite green, fixing only selectors broken by portals. Commit `feat(web): dialogs, menus, tabs and toasts on Radix`.

### Task 4: App shell and navigation
- `app/navigation.ts`: the `NAV` entries `{ to, label, icon, group, anyOf }` and `visibleNav(permissions)`. It replaces `AREAS` and `visibleAreas`.
- `app/AppLayout.tsx`:
  - sidebar for ≥ lg widths (collapsible; collapse state kept with safe `localStorage`; auto-collapsed on `/pos` between lg and xl);
  - top bar plus bottom tabs below lg, with up to 4 entries and the rest under "More" in a dropdown;
  - full-screen dark on `/kds`;
  - centred auth layout for `/login` and `/pin`.
- `app/header/{DayStatusPill,UserMenu}.tsx` with `ServerStatus` restyled. The day query reaches the header through `features/day` exports (`useBusinessDay` re-exported).
- The `AppShell` keeps its providers (realtime, print worker, toaster) and renders `AppLayout`.
- Tests:
  - nav filtered for cashier, waiter and owner;
  - day pill states: open, not open (with link for `day.openClose`), not open without the link for a waiter;
  - the user menu signs out.
- [ ] Commit `feat(web): app shell with role navigation, day and connection status`.

### Task 5: Role home dashboard
- `app/HomePage.tsx` (replaces `Home`):
  - **Owner:** stat cards for sales and bills today (`useSalesReport` today from `features/reports`); open tables and unpaid bills from close-check (`features/day` `useCloseCheck` exported; shown only when a day is open); QR waiting (`useQrPending`); low stock (`useStockItems`).
  - **Manager:** the same without the sales report (uses close-check cash sales).
  - **Cashier and waiter:** large action tiles and a QR-waiting card.
  - Quick actions come from `visibleNav`.
- Each card is shown only with its permission (`useCan`), so a query never fires without it. Cards show skeletons while loading and an error note with retry.
- Tests:
  - an owner sees the sales card;
  - a cashier's home makes no request to `/api/reports/sales` or `/api/stock/items`;
  - day closed: the close-check card is hidden and the day pill shows "Day not open".
- [ ] Commit `feat(web): role-based home dashboard`.

### Task 6: Restyle service screens
- **POS and captain pages:** `PageHeader`, cards, two-column layout tuned for 1366×768.
- **Floor grid:** `StatusPill` and icon per table status (free, running, bill printed, QR waiting).
- **Parcel list, order panel:**
  - KOT cards use badges for status and print state;
  - new lines use a stepper of `IconButton`s;
  - send uses a `Button lg loading`.
- **Menu browser:** category `Tabs` styling, search `Input` with an icon, dish tiles as cards with a food dot and price.
- **Billing:** `BillView` as a card; sheets get `Dialog`; payment mode buttons.
- **QR inbox and request card:** violet tone.
- **KDS:** `data-theme="dark"`, large ticket cards, ages colour-coded with text.
- Tests: the existing service, billing, QR and KDS suites stay green.
- [ ] Screenshots of POS (1366×768 and 1440×900), captain (phone) and KDS (dark). Commit `feat(web): restyle POS, captain and kitchen screens`.

### Task 7: Restyle back office
- **Day close:** `PageHeader`, stat cards for the cash tally, blockers as an alert.
- **Stock:** `DataTable`, low-stock alert, `EmptyState`.
- **Purchases:** cards per purchase.
- **Expenses:** form card and a totals `StatCard`s row.
- **Reports:** `StatCard`s, `DataTable`s, `Tabs` for days, dishes and categories.
- Destructive confirms (void and remove) move to `ConfirmDialog`, keeping the same labels.
- [ ] Tests green; screenshots. Commit `feat(web): restyle day close, stock, expenses and reports`.

### Task 8: Restyle admin and auth
- **Auth pages:** centred card, outlet name, big PIN pad keys (≥ 64 px).
- **Admin layout:** `Tabs`-style sub-navigation; every admin page gets a `PageHeader` with a one-line explanation, `Card` sections, `DataTable` lists and `EmptyState`s.
- Archive and remove confirmations move to `ConfirmDialog` where they were `ConfirmBar` (same labels).
- [ ] Tests green; screenshots. Commit `feat(web): restyle admin and sign-in screens`.

### Task 9: Accessibility, docs and budget
- `vitest-axe` tests for login, the role home, POS, stock and the admin menu, with no serious or critical violations.
- `apps/web/ARCHITECTURE.md`: a UI kit section (tokens, components, when to use `Dialog` vs `ConfirmBar` vs `ConfirmDialog`).
- Bundle compared with base: record the result.
- [ ] Commit `test(web): accessibility checks and UI kit docs`.

## After the last task
Full suite, screenshots of all routes for the user, fresh review, one fix pass, merge `feat/u1-design-system` locally (push only if the user asks).
