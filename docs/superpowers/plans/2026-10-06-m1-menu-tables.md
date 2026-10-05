# M1 Menu, Tables, Tax & Kitchen Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The client can enter their real menu (categories, items with Half/Full-style variants, dine-in and parcel prices, packaging charges, add-ons, combos), their floor (areas and tables), their tax rates, and their kitchen stations and printers; staff can mark items out of stock.

**Architecture:** New NestJS modules `tax`, `kitchen` (stations + printers), `floor` (areas + tables), `menu` (categories, items, variants, add-on groups, combos, availability). All rows carry `outlet_id`; services scope every query by the caller's outlet. Master data is archived, never deleted (later order items keep references). Prices are integer paise. The web admin gets Menu, Add-ons, Tables, Kitchen and Tax screens; staff get an Availability screen.

**Tech Stack:** unchanged from M0b.

**Spec:** `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md` §4.2 (menu/floor entities), §4.4 rules 1–2, §6.1 (Menu/prices/tax/tables/printers row), §9 M1.

**Out of scope:** orders/KOT (M2), QR token rotation and QR ordering (M4), live push of availability changes (M2 realtime), printing itself (M2).

## Global Constraints

- All M0a/M0b constraints apply.
- Permissions (spec §6.1): tax rates, stations, printers, areas, tables → `settings.manage` (owner). Categories, items, variants, add-ons, combos → `menu.manage` (owner, manager). Item/add-on availability → `menu.availability` (everyone). Reading the menu, tables and stations → any signed-in user.
- Money in paise (integers ≥ 0, ≤ 10,00,000 rupees per price). Tax in basis points; GST is split equally: `cgstBp = sgstBp`.
- Every item has ≥ 1 active variant (spec §4.4 rule 1). Items without sizes use one variant named "Regular".
- Archive instead of delete. Archiving something still in use answers `409 {code:'IN_USE'}`.
- Names are unique among active rows of the same parent (category names per outlet, item names per category, variant names per item, table names per outlet, etc.) → `409 {code:'NAME_TAKEN'}`.
- Price changes to variants or add-ons are audited (`menu.price`), with before/after in rupees-free paise integers.
- Seed creates one station "Kitchen" and one tax rate "GST 5%" (250 + 250 bp) when the outlet has none.

## Review Focus

1. **Archived things leaking back** — archived categories/items/variants/add-ons/tables must not appear in the menu or floor reads used by POS and captain, and cannot be referenced by new items or combos. Pinned in Task 5/4 e2e.
2. **Cross-outlet references** — an item must not reference another outlet's category, tax rate, add-on group or combo component. Pinned in Task 5 e2e.
3. **Rupee input rounding** — "120.5", "120.50", "₹1,200" and "0.1" must convert exactly; "12.345" and negative values are rejected. Pinned in Task 1 tests.
4. **Combo integrity** — a combo cannot contain itself or another combo, and needs at least one component. Pinned in Task 5 e2e.
5. **Editing variants does not break history** — removing a variant archives it (keeps its id) instead of deleting. Pinned in Task 5 e2e.

---

### Task 1: Shared menu, floor, kitchen and tax schemas

**Produces (`@rpos/shared`):**
- `parseRupees(input: string): Paise | null` — accepts digits with optional `₹`, commas, up to 2 decimals; returns null otherwise. `paiseToRupeesInput(p: Paise): string` ("120.50" → "120.5"? no: always minimal: 12050 → "120.50", 12000 → "120").
- `FOOD_TYPES = ['VEG','NON_VEG','EGG']`, `PRINTER_PURPOSES = ['KOT','BILL']`, `PRINTER_MODES = ['BROWSER','AGENT']`, `PAPER_WIDTHS = [58, 80]`.
- `priceSchema` (int 0..100_000_000), `sortOrderSchema`.
- `taxRateSchema {name, ratePercent→ cgstBp/sgstBp}`: request `{ name, totalBp }` where totalBp is even, 0..2800.
- `stationSchema {name}`; `printerSchema {name, purpose, stationId?, mode, paperWidthMm, address?}` with refine: KOT needs stationId; AGENT needs address.
- `areaSchema {name, sortOrder?}`; `tableSchema {areaId, name, seats 1..50}`.
- `categorySchema {name, stationId, sortOrder?}`.
- `variantInputSchema {id?, name, dineInPrice, parcelPrice?, packagingCharge?}`.
- `itemSchema {categoryId, name, description?, foodType, taxRateId, variants: variantInput[1..10], addonGroupIds: uuid[], isCombo, components: {variantId, quantity 1..20}[]}` with refines: unique variant names (case-insensitive), combo ⇔ components non-empty.
- `addonGroupSchema {name, minSelect, maxSelect, addons: {id?, name, price}[1..30]}` with min ≤ max ≤ addons.length.
- `availabilitySchema {isAvailable: boolean}`.

- [ ] Tests first (`menu.test.ts`): parseRupees cases ("120"→12000, "120.5"→12050, "₹1,200.75"→120075, "0.1"→10, "12.345"→null, "-5"→null, "abc"→null, ""→null); itemSchema rejects zero variants, duplicate variant names ("Half"/"half"), combo without components, components on non-combo; addonGroupSchema rejects min > max; printerSchema KOT without station; taxRateSchema rejects odd bp.
- [ ] Implement, run, commit `feat(shared): add menu, floor, kitchen and tax schemas`.

### Task 2: Data model and seed defaults

Prisma models (snake_case, uuid, timestamps, `archived_at` where noted):
`TaxRate(outletId, name, cgstBp, sgstBp, archivedAt)`, `Station(outletId, name, archivedAt)`, `Printer(outletId, name, purpose, stationId?, mode, paperWidthMm, address?, archivedAt)`, `Area(outletId, name, sortOrder, archivedAt)`, `DiningTable(outletId, areaId, name, seats, qrToken unique, archivedAt)` → table `tables`, `Category(outletId, stationId, name, sortOrder, archivedAt)`, `Item(outletId, categoryId, taxRateId, name, description?, foodType, isCombo, isAvailable, sortOrder, archivedAt)`, `ItemVariant(itemId, name, dineInPrice, parcelPrice, packagingCharge, sortOrder, archivedAt)`, `AddonGroup(outletId, name, minSelect, maxSelect, archivedAt)`, `Addon(groupId, name, price, isAvailable, sortOrder, archivedAt)`, `ItemAddonGroup(itemId, groupId, sortOrder)` composite PK, `ComboComponent(comboItemId, variantId, quantity)`.
Seed: default station + GST 5% when none.

- [ ] Tests first: seed e2e — station "Kitchen" and tax "GST 5%" (250/250) created once.
- [ ] Migration `menu_floor_kitchen`, implement seed, run, commit.

### Task 3: Tax rates, stations and printers API

`GET/POST /api/tax-rates`, `PATCH /api/tax-rates/:id`, `POST /api/tax-rates/:id/archive`; same shape for `/api/stations` and `/api/printers`. GET is any signed-in user; writes need `settings.manage`. Archive tax rate used by an active item → 409 IN_USE; archive station used by an active category or printer → 409 IN_USE. Audit `tax.*`, `station.*`, `printer.*`.

- [ ] Tests first (`kitchen-tax.e2e-spec.ts`): owner creates GST 18% → cgst/sgst 900/900; manager POST → 403; duplicate name → 409 NAME_TAKEN; KOT printer without station → 400; archive station in use → 409; archived rows excluded from GET by default, included with `?include=archived`.
- [ ] Implement, run, commit.

### Task 4: Areas and tables API

`GET /api/floor` → `[{id,name,sortOrder,tables:[{id,name,seats}]}]` (active only, ordered); `POST/PATCH /api/areas`, `POST /api/areas/:id/archive`; `POST/PATCH /api/tables`, `POST /api/tables/:id/archive`. Writes need `settings.manage`. Table names unique per outlet (active). Archive area with active tables → 409 IN_USE. New table gets a random `qrToken` (never returned by `/api/floor`; admin `GET /api/tables/:id` returns it for QR printing in M4).

- [ ] Tests first (`floor.e2e-spec.ts`): create AC Hall + T1..T3; floor read shape and order; duplicate "T1" in another area → 409; archive area with tables → 409; archived table missing from floor; waiter can read floor, cannot create.
- [ ] Implement, run, commit.

### Task 5: Menu API

- `GET /api/menu` (any signed-in) → `{categories:[{id,name,station:{id,name},items:[{id,name,description,foodType,isAvailable,isCombo,taxRate:{id,name,cgstBp,sgstBp},variants:[{id,name,dineInPrice,parcelPrice,packagingCharge}],addonGroups:[{id,name,minSelect,maxSelect,addons:[{id,name,price,isAvailable}]}],components:[{variantId,itemName,variantName,quantity}]}]}]}` — active rows only, sorted.
- `POST/PATCH /api/menu/categories`, `POST /api/menu/categories/:id/archive` (409 IN_USE with active items).
- `POST /api/menu/items`, `PATCH /api/menu/items/:id` (full replace of variants by id: unknown ids → 400, omitted existing → archived, new → created; addon links replaced; components replaced), `POST /api/menu/items/:id/archive` (409 IN_USE when part of an active combo).
- `PATCH /api/menu/items/:id/availability` and `PATCH /api/menu/addons/:id/availability` (`menu.availability`).
- `POST/PATCH /api/menu/addon-groups`, `POST /api/menu/addon-groups/:id/archive` (unlinks nothing; archived groups vanish from menu reads).
- All references validated inside the caller's outlet and active → else 400 `{code:'INVALID_REFERENCE', field}`.
- Combo rules: components must be variants of active non-combo items, not the combo itself.
- Audit `menu.price` when any variant price or add-on price changes; `menu.item.archive`, `menu.category.archive`.

- [ ] Tests first (`menu.e2e-spec.ts`): create category + item with Half/Full → menu read shape; parcel price defaults to dine-in; PATCH removing "Half" archives it (row still exists, absent from menu); price change writes `menu.price` audit; cross-outlet category/tax/addon group → 400 INVALID_REFERENCE; archived category can't take new items; combo with a combo component → 400; combo without components → 400 (schema); waiter toggles availability → 200 and menu shows `isAvailable:false`; waiter cannot create items → 403; manager can create items but not tax rates.
- [ ] Implement, run, commit.

### Task 6: Web admin — Kitchen, Tax and Tables screens

Admin tabs gain **Tables**, **Kitchen** (stations + printers), **Tax** (tax rates) for `settings.manage`. Inline add/edit forms, archive with ConfirmBar. Money/percent inputs use shared parsers.

- [ ] Tests first: TaxPage — "18" % → POST `{name, totalBp: 1800}`; KitchenPage — KOT printer requires a station (field error, no request); TablesPage — renders areas with tables, adds a table to an area.
- [ ] Implement, run, commit.

### Task 7: Web admin — Menu and Add-ons screens

Menu tab: category list (add/rename/archive) and per-category item list with food-type dot, price summary, availability. Item editor: name, description, food type, tax rate, variants table (name, dine-in ₹, parcel ₹ defaulting to dine-in, packaging ₹; add/remove rows), add-on groups multi-select, combo toggle with component picker. Add-ons tab: groups with min/max and add-on rows.

- [ ] Tests first: ItemEditor — "Half" ₹120, "Full" ₹220.50 posts paise 12000/22050 and parcel defaults; invalid price "12.345" shows error and no request; combo toggle requires a component; AddonsPage — min > max shows error.
- [ ] Implement, run, commit.

### Task 8: Staff availability screen

`/availability` (needs `menu.availability`): search box, items grouped by category with on/off switches (and add-ons below), optimistic toggle with rollback on error. Home and nav show "Item availability".

- [ ] Tests first: toggling sends PATCH and updates the switch; server error reverts the switch and shows "Could not update. Try again."; search filters items.
- [ ] Implement, run, commit.
