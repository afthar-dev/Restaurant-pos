# U5 Phase 4: QR Customer Menu Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The customer QR menu works the way Indian diners expect from Swiggy and Zomato (search, veg-only, a menu jump list, dish rows with a photo and an ADD button that turns into a stepper, a sticky cart bar, a clear order page and order status), in the restaurant's own saffron brand, light and dark.

**Architecture:** Colour tokens move to one stylesheet shared by both apps (`packages/shared/theme/tokens.css`). The QR app moves to those tokens and Inter. The menu becomes one scrolling list of category sections; per-dish quantity comes from the existing cart store (`useCart`), so ADD / stepper state needs no new store. Only patterns are borrowed: no other company's names, logos or colours.

**Tech Stack:** React 19, Zustand (existing cart store), Tailwind 4, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-u5-ui-polish-design.md` (Phase 4), extended by the user on 2026-10-10: "use the design like Swiggy and Zomato and make the UI/UX better".

## Global Constraints

- Saffron brand from the shared tokens; no other company's names, marks or brand colours.
- 44 px minimum targets; 16 px body text; `tabular-nums` on money; light and dark readable.
- Every control has an accessible name; food type announced once per dish.
- Prices shown are menu prices; GST is added on the final bill (say so once on the order page).
- Ordering rules unchanged: the order goes to the staff for approval; required choices block Add.
- No em dashes in UI sentences.

## Review Focus

- **Long menus:** the jump list reaches every category; search and veg-only filter across all of them and say when nothing matches.
- **Customisable dishes:** the stepper's + opens the choice sheet (a new line may differ); − on a dish with several cart lines opens the order page instead of guessing which line.
- **Dark phones:** every screen readable.
- **Keyboard / screen reader:** ADD, stepper, jump list and sheets are reachable and named.

## Tasks

### Task 1: Shared token stylesheet
Move the colour tokens (all `@theme` colour/radius/shadow tokens, the solid tokens block, the dark media query and the `[data-theme='dark']` rule) from `apps/web/src/app/index.css` to `packages/shared/theme/tokens.css` unchanged; web `index.css` `@import`s it. `theme.test.ts` reads the shared file. Test: theme test passes unchanged; web CSS gzip within 0.1 kB. Commit `refactor: colour tokens in one stylesheet shared by both apps`.

### Task 2: QR app on the shared tokens
Add `@fontsource-variable/inter`; QR `index.css` imports Tailwind, the Inter face, the shared tokens, sets `body` background/text/font. Map classes: `bg-white`→`bg-surface`, `text-slate-900`→`text-text`, `text-slate-500..800`→`text-muted`, `border-slate-300`→`border-border-strong`, `divide-slate-100`→`divide-border`, `bg-slate-100`→`bg-surface-2`, `bg-emerald-700`→`bg-primary-700`, accepted request emerald→green scale. Failing test first: no `emerald`/`slate` class in the rendered menu, cart bar uses `bg-primary-700`. Commit `feat(qr): brand colours, Inter and dark mode from the shared tokens`.

### Task 3: Header, search, veg-only, sections, jump list, dish rows
- Header: restaurant name (h1 stays "Table T1"; restaurant above), "Dine-in · order here, the staff confirm it".
- Search field (`aria-label="Search dishes"`) and a Veg only switch (`role="switch"`), both filtering every category; "No dishes match" message.
- All categories as `<section aria-labelledby>` with `h2` "Starters" and a count; a floating **Menu** button (bottom right, above the cart bar) opens a sheet listing categories with counts; choosing one scrolls to it and closes.
- Dish row: left: FoodMark, name (semibold), price (`text-primary-800`), description `line-clamp-2`; the left block is a button named `"<name>, <food>, <price>"` that opens the dish sheet. Right: 112 px rounded photo (or nothing), and an **ADD** button (`aria-label="Add <name>"`) overlapping the photo's bottom edge (or alone). Dishes with sizes or add-ons show "Customisable" under ADD and ADD opens the sheet. Once the dish is in the cart, ADD becomes a stepper: `One less <name>`, count, `One more <name>`; for customisable dishes + opens the sheet and − opens the order page when the dish has more than one cart line.
- Failing tests first for: search, veg only, jump list, ADD adds a plain dish straight to the cart and turns into a stepper with count 1, + / − change it, ADD on a customisable dish opens its sheet.
- Commit `feat(qr): search, veg only, menu jump list and dish rows with ADD`.

### Task 4: Dish sheet
Photo at the top, name with FoodMark, description; size and add-on groups as bordered option cards (`Required` badge, "Pick up to 2" hint); note; sticky footer: stepper (`One less` / `One more`) and **Add item · ₹X** (disabled until required choices are made). Update the existing tests' `Add · ₹` matchers to `Add item · ₹`. Commit `feat(qr): dish sheet with option cards and a sticky add bar`.

### Task 5: Cart bar and order page
Cart bar: saffron, full width (max 28rem), `"<n> item(s) | ₹X"` left, `View order` right, named `View order, <n> items, ₹X`. Order page (sheet titled "Your order"): lines with FoodMark-less label, stepper, line total; "Cooking instructions (optional)"; summary "Item total ₹X" and "GST is added on the final bill"; **Place order** button (busy: "Sending…"), error alert, the existing request-id retry behaviour. Update the send test to the new names. Commit `feat(qr): cart bar and order page`.

### Task 6: Order status, loading, problem screens
Sent orders as cards under the header ("Your orders"): status icon and colour per state, the message, lines, approx total. Menu loading: `role="status"` named "Loading the menu" with a header bar, chip bar and four dish-row skeletons (`data-skeleton="dish"`). Problem screens (scan to order, unknown code, table closed, opening): centred icon in a 48 px circle, heading, one sentence, full-width action. Failing tests for the skeleton and problem-screen icon. Commit `feat(qr): order status cards, menu loading and problem screens`.

### Task 7: Browser pass, review, merge
Build both apps (record QR gzip). Browser at 375 px light and dark: menu, search, veg only, jump list, ADD/stepper, sheet, cart bar, order page, a sent order, unknown code. Full checks, fresh review, fix Critical/Important with tests, merge `--no-ff`.
