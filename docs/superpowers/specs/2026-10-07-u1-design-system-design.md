# U1 — Design System and App Shell (Design Spec)

**Status:** approved in conversation (2026-10-07). This is part 1 of 4 of the UI/UX programme:
U1 design system and shell; U2 service-screen speed (POS, captain, KDS); U3 back office, admin
and guided onboarding; U4 customer QR app.

## 1. Purpose

The client asked for "production grade" screens that are easy for restaurant staff to
understand. Today the staff app (`apps/web`) works but looks like an internal tool. The styling
is ad-hoc Tailwind classes, the controls are home-grown (a hand-rolled sheet and confirm bar),
there are no icons, the home page is a list of links, and nothing shows the state of the
business day or the connection at a glance.

U1 gives every screen a consistent, professional, accessible foundation without changing what
the screens do. Later parts change flows (U2, U3) on top of it.

**Success looks like:**
- Every staff screen uses the same components, spacing, type and colours.
- Navigation shows only what the signed-in role can use, works on a 1366×768 touch POS, a
  tablet and a 5" phone, and the kitchen display is a dark, chrome-free full screen.
- After sign-in, staff see where they are and what needs attention: day open or closed,
  connection, QR orders waiting, low stock.
- No behaviour regressions. Every existing test stays green and only selectors that named old
  markup change.
- Accessibility: keyboard reachable, visible focus, AA contrast, touch targets of at least 44
  px, dialogs trap focus and close on Escape.

**Out of scope for U1:**
- New flows, shortcuts and quick-pay (U2).
- The setup wizard, help copy rewrite and charts (U3).
- The QR app (U4).
- Real logo upload (U3 or later).
- Regional languages.
- API changes. U1 is frontend-only.

## 2. Decisions

| Decision | Choice |
|---|---|
| Brand | Neutral restaurant look (option B). Outlet name in the header; logo slot ready for later. |
| Approach | Own Tailwind 4 component kit, with Radix UI primitives for interactive widgets (shadcn/ui pattern). |
| Icons | `lucide-react` (tree-shaken, imported per icon). |
| Font | Inter, self-hosted via `@fontsource-variable/inter` (works without CDN access). |
| Theme | Light for all screens; dark theme only on the KDS (`data-theme="dark"` on its root). |
| Bundle budget | U1 adds at most 45 kB gzip to the web app. Measured before merge. |

## 3. Design tokens (`apps/web/src/app/index.css`, Tailwind 4 `@theme`)

All colours, radii, shadows and fonts are CSS variables. Components use semantic classes
(`bg-surface`, `text-muted`, `bg-primary`), never raw palette names. That way a later brand
change edits one file.

- **Neutrals (stone):** `--color-bg` (stone-50), `--color-surface` (white), `--color-surface-2`
  (stone-100), `--color-border` (stone-200), `--color-text` (stone-900), `--color-muted`
  (stone-600).
- **Primary (saffron/orange):**
  - `--color-primary` (#c2410c, orange-700: white text passes AA at 5.2:1);
  - `--color-primary-hover` (orange-800);
  - `--color-primary-soft` (orange-50) for selected states.
- **Semantic:** success (green-700/50), warning (amber-700/50), danger (red-700/50) and info
  (sky-700/50). Each comes as a strong colour and a soft background.
- **Table status:** free = success, running = warning, bill printed = info, QR waiting =
  violet-700/50. Status is always shown as an icon and text too, never by colour alone.
- **Type:** Inter variable. Scale: xs 12, sm 14, base 16, lg 18, xl 20, 2xl 24, 3xl 30. Money
  and quantities use `tabular-nums`.
- **Radius:** sm 6, md 10, lg 14, full. **Shadows:** sm (cards) and lg (dialogs and toasts).
- **Focus:** a 2 px primary ring with a 2 px offset on every interactive element (`:focus-visible`).
- **Dark (KDS):** bg stone-950, surface stone-900, text stone-50, with the same semantic hues
  lightened to keep AA.

## 4. Component kit (`apps/web/src/shared/ui`, one file per component, exported from `index.ts`)

| Component | Notes |
|---|---|
| `Button` | variants `primary`, `secondary`, `ghost`, `danger`; sizes `sm` (36 px), `md` (44 px), `lg` (52 px); `loading` (spinner, keeps width, sets `aria-busy`); `icon` slot; `asChild` for links |
| `IconButton` | square, requires `label` (`aria-label`), at least 44 px |
| `Input`, `Textarea`, `Select` (native, styled) | error state via `aria-invalid` |
| `MoneyInput`, `QuantityInput` | ₹ or unit adornment, `inputMode="decimal"` |
| `Field` | label, hint, error; wires `aria-describedby`; keeps today's API |
| `Card`, `CardHeader`, `CardBody` | the surface primitive |
| `PageHeader` | title, one-line description of the screen, actions slot, optional back link |
| `Badge` / `StatusPill` | tones neutral, success, warning, danger, info, violet; optional icon |
| `StatCard` | label, value, optional hint and trend |
| `DataTable` | semantic `<table>` with sticky header, numeric alignment, `empty` slot and horizontal scroll on small screens |
| `EmptyState` | icon, title, one sentence, primary action |
| `Skeleton` | text, row and card shapes |
| `Dialog` (Radix) | title (required), description, footer actions; centred on desktop, bottom sheet on phones; replaces `Sheet` with the same `label` and `onClose` contract |
| `ConfirmDialog` (Radix AlertDialog) | for destructive actions; the confirm button names the action ("Void bill 12") |
| `Tabs` (Radix) | used for category tabs and admin sub-sections |
| `DropdownMenu` (Radix) | user menu and row actions |
| `Tooltip` (Radix) | icon-only buttons on desktop |
| `Toaster` | restyled; tones and icons from the notifications store (store API unchanged) |
| `Spinner`, `ErrorNote` (restyled as an `Alert` with icon), `LoadingScreen` | |

`ConfirmBar` stays for inline, non-destructive confirmations (it is used in many tests). Each
destructive use moves to `ConfirmDialog` with the same button labels.

## 5. App shell and navigation (`apps/web/src/app`)

- **`AppLayout`:**
  - **≥ 1024 px:** a left sidebar, 240 px wide, collapsible to 72 px icons (remembered per
    device in `localStorage`, with safe storage handling). It collapses automatically on
    widths of 1024–1366 px while the POS route is open.
  - **< 1024 px:** a top bar, plus a bottom tab bar with up to 4 primary destinations for the
    role and a "More" sheet for the rest.
  - **`/kds`:** no chrome at all, full-screen dark.
  - **`/login` and `/pin`:** a centred card on a soft background, with the outlet name.
- **Navigation model:** one `NAV` list (`app/navigation.ts`). Each entry has path, label, icon,
  `anyOf` permissions and a group: Service (POS, Captain, Kitchen, Availability), Back office
  (Day close, Stock, Expenses, Reports) or Admin. It replaces `AREAS` in `Home.tsx`; the entries
  are filtered by permissions as today.
- **Header (top of the content area):**
  - outlet name;
  - **day status pill** (day open since a time, or "Day not open" with an "Open day" link for
    users with `day.openClose`);
  - **connection pill** (reuses `ServerStatus`, restyled);
  - **user menu**: name, role, "Switch staff" (to `/pin` on a registered device), "Sign out".
- **Role home (`/`):**
  - **Owner and manager:**
    - stat cards (today's sales and bills, from `/api/reports/sales` for the owner and from
      the close-check cash for a manager);
    - open tables and unpaid bills (close-check blockers);
    - QR orders waiting (`useQrPending`);
    - low-stock count (stock items) with links;
    - quick actions.
  - **Cashier and waiter:** large action tiles (POS or Tables, Expenses), the day status and
    QR waiting.
  - Each card hides itself when the user lacks the permission behind it, and shows a skeleton
    while it loads. No new API endpoints.
- **Route pages:** every page starts with `PageHeader` (title plus a one-line explanation of the
  screen in plain words) and uses `Card` and `DataTable`. Admin keeps its sub-navigation, now as
  `Tabs` styled links.

## 6. Restyling the existing screens

All 20 pages and their components move to the kit:

- **Auth:** Login, PIN
- **Service:** POS, Captain, KDS
- **Back office:** Day, Stock, Purchases, Expenses, Reports
- **Admin:** Menu, Add-ons, Availability, Tables (with QR stickers), Kitchen setup, Tax, Staff,
  Devices, Settings, Audit

Behaviour, routes, data hooks and API calls stay unchanged. Where a page needs an icon or a
status, it uses the shared `StatusPill`. The floor grid uses the table-status tokens with an
icon and text.

## 7. Error, loading and empty states

- **Loading:** skeleton shapes instead of "Loading…" text on lists and cards.
- **Errors:** every query error shows `ErrorNote` with a retry button where the query can refetch.
- **Empty lists:** every empty list shows `EmptyState` with the next step ("No dishes yet. Add
  your first category.").
- **Toasts:** use the store; success, warning and error tones each have an icon.

## 8. Testing and verification

- **Existing tests:** web 206 and QR 22 stay green. Selectors change only where markup really
  changed (e.g. a confirm moving into a dialog); accessible names stay the same.
- **New unit tests:** Button (loading, disabled, asChild), Dialog (focus trap, Escape, title
  required), ConfirmDialog, DataTable empty state, StatusPill, navigation filtering by
  permission, role home cards hidden without permission.
- **Accessibility:** `vitest-axe` runs on the shell, the role home, POS, the stock page and the
  login page, with no serious violations allowed.
- **Visual:** browser screenshots of every route at 1440×900, 1366×768 and 390×844 (phone), plus
  the dark KDS. I review them before merge and the user can see them.
- **Gates:** lint (boundaries included), typecheck, build, and the bundle size reported against
  the 45 kB budget.

## 9. Risks

- **Large diff across all pages.** It is done page group by page group, with tests after each.
- **Test churn from markup changes.** Accessible names are a contract; markup changes keep
  them stable.
- **Radix in jsdom.** Pointer and portal behaviour need setup shims (`ResizeObserver`,
  `hasPointerCapture`) in `test/setup.ts`.
