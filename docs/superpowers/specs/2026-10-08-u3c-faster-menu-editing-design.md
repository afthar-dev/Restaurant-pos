# U3c — Faster menu editing

Part of U3 (setup guide and sales charts done; this; then logo on bills).

## 1. Purpose

Admin → Menu works one dish at a time. Real menu work is in bulk: "find the paneer dishes",
"add a dish like this one", "raise every price 5% for the new year", "put Biryani first". Today
each is many taps or impossible (there is no way to set the order at all).

**Success looks like:**
- **Search:** typing in a search box on Admin → Menu narrows the list to matching dishes at once.
- **Duplicate:** one tap on a dish opens the editor pre-filled as a new dish ("Paneer Tikka
  (copy)") with the same sizes, prices, add-ons and combo contents.
- **Bulk price change:** change prices for the whole menu, one category or picked dishes, by a
  percentage or a rupee amount, rounded to ₹1 / ₹5 / ₹10, with a preview of every old → new price
  before saving, saved in one step and in the audit log.
- **Reorder:** drag categories, and dishes within a category, into the order the POS, captain and
  QR menus show them; works with mouse, touch and keyboard.
- New dishes go to the end of their category, so a chosen order is kept.

**Out of scope:** reordering sizes or add-ons, moving dishes between categories by drag,
scheduled price changes, undo for bulk changes (the audit log has before/after).

## 2. Decisions

| Question | Choice |
|---|---|
| Search | Client-side over the loaded menu; matches dish name or size name, case-insensitive, ignores extra spaces. |
| Duplicate | Client-side: opens `ItemEditor` in create mode with copied fields; saved with the existing create endpoint. Name gets " (copy)" because names must be unique within a category. |
| Bulk change maths | One pure function in `packages/shared` used by both the preview and the API, so the preview is exactly what is saved. |
| Bulk change scope | Variants of the chosen active dishes; both dine-in and parcel prices; packaging charges untouched. |
| Drag library | `@dnd-kit/core` + `@dnd-kit/sortable` for mouse and touch, loaded only with the lazy Menu page; Move up/down buttons for keyboard and single tap. |
| Reorder save | Whole list order in one request (`ids` in the new order), applied as `sortOrder = index`. |

## 3. API

All under the existing menu controller, `menu.manage`, outlet-scoped, audited.

### 3.1 Reorder
- `PUT /api/menu/categories/order` `{ ids: uuid[] }` — must be exactly the outlet's active
  categories (same set, no duplicates), else 400 `INVALID_REFERENCE` with "The menu changed.
  Reload and try again." Sets `sortOrder` to the index. Audit `menu.category.reorder` with the
  new order of names.
- `PUT /api/menu/categories/:id/items/order` `{ ids: uuid[] }` — must be exactly the active items
  of that category. Sets `sortOrder`. Audit `menu.item.reorder`.
- `createItem` sets `sortOrder` to one more than the highest in its category (0 for the first).
  `createCategory` without a `sortOrder` gets one more than the highest category.

### 3.2 Bulk price change
`POST /api/menu/prices` with
```ts
{
  itemIds: uuid[];                // 1..500, active items of the outlet
  change: { kind: 'percent'; basisPoints: number }   // -9000..20000 (−90% .. +200%)
        | { kind: 'amount'; paise: number };          // -1_000_000..1_000_000, non-zero
  roundTo: 100 | 500 | 1000;     // paise: ₹1, ₹5, ₹10
}
```
- For every active variant of those items, `dineInPrice` and `parcelPrice` become
  `applyPriceChange(old, change, roundTo)`.
- `applyPriceChange` (shared): percent → `old × (10000 + bp) / 10000`; amount → `old + paise`;
  then round to the nearest `roundTo` (halves up). A price of ₹0 stays ₹0 for percent changes.
- If any new price would be below 0 or above `MAX_PRICE_PAISE`, nothing is saved: 400
  `VALIDATION` naming the first dish and size ("Roti Regular would go below ₹0").
- One transaction; one audit entry `menu.price.bulk` with `{ change, roundTo, prices: [{ item,
  variant, before: {dineIn, parcel}, after: {dineIn, parcel} }] }`.
- Response `{ updated: number }` (variants changed). Unknown or archived item ids → 400
  `INVALID_REFERENCE`.

Bills already store their own prices, so past bills never change.

## 4. Web

### 4.1 Search
- A search field ("Search dishes") above the category list on Admin → Menu. While it has text:
  only categories with matching dishes show, each with only those dishes; the count line reads
  "3 dishes match "paneer"". Empty result: EmptyState "No dishes match "xyz"" with a Clear
  button. Reorder handles are hidden while searching.

### 4.2 Duplicate
- Each dish row gets a **Duplicate** action next to Edit. It opens the item editor titled "New
  dish" with: name + " (copy)", same category, description, food type, tax, sizes and prices (no
  ids), add-on groups, combo flag and contents. Saving creates a new dish; the original is
  untouched.

### 4.3 Bulk price change
- **Change prices** button in the Menu header opens a dialog (wide):
  1. **Which dishes:** All dishes / One category (select) / Pick dishes (searchable checklist).
  2. **Change:** Increase or Decrease; by **%** or **₹**; amount field.
  3. **Round to:** ₹1 / ₹5 / ₹10 (default ₹1).
  4. **Preview:** table of dish, size, dine-in old → new, parcel old → new, only rows that change;
     count line "24 prices will change". Rows whose price would fall below ₹0 are marked and the
     save button is disabled with the reason.
  5. **Update 24 prices** (primary) saves; success toast "Prices updated for 24 sizes"; the menu
     refreshes.
- Dialogs keep their content on outside taps (kit default).

### 4.4 Reorder
- A **Reorder** toggle in the Menu header switches the list into reorder mode: each category
  header and dish row gets a drag handle (`GripVertical`, label "Move {name}"). Other actions hide.
- Drag the handle with mouse or touch (dnd-kit pointer and touch sensors). Every row also has
  **Move up** / **Move down** buttons (labelled with the name), the keyboard, screen-reader and
  single-tap way to reorder (WCAG 2.5.7 needs a non-drag alternative).
  drop, Escape to cancel (dnd-kit sortable keyboard sensor), with spoken announcements.
- Dropping saves at once (optimistic): the list shows the new order; on error it returns to the
  server order and shows the error. **Done** leaves reorder mode.

## 5. Code

- `packages/shared/src/menu.ts`: `applyPriceChange`, `bulkPriceSchema`, `reorderSchema`.
- `apps/api/src/menu`: controller routes; service `reorderCategories`, `reorderItems`,
  `bulkPrices`; `createItem`/`createCategory` sort order.
- `apps/web/src/features/menu`:
  - `api.ts`, `mutations.ts`: `reorderCategories`, `reorderItems`, `bulkPrices` with
    invalidation of `menuKeys.all`.
  - `search.ts`: `filterMenu(menu, query)` pure.
  - `components/BulkPriceDialog.tsx`, `components/SortableList.tsx` (thin dnd-kit wrapper).
  - `pages/MenuPage.tsx`: search, Duplicate, Change prices, Reorder mode.
  - `ItemEditor.tsx`: accepts a `copyFrom` item for duplicate.

## 6. Tests

- Shared: `applyPriceChange` — percent up/down with rounding to ₹1/₹5/₹10, halves up, amount,
  ₹0 stays ₹0 for percent, negative result reported.
- API e2e: reorder categories and items (order shows in `GET /api/menu`); wrong id set → 400;
  another outlet's ids → 400; new item lands last; bulk price percent and amount with rounding;
  below-zero → 400 and nothing saved; archived item → 400; audit entries; non-manager → 403.
- Web: `filterMenu`; search narrows and clears; Duplicate pre-fills and posts a new item without
  variant ids; bulk dialog preview matches `applyPriceChange`, disables save on negative,
  posts the right body, shows the toast; reorder via Move up/down sends the new id order and
  reverts on error; `moveId` pure helper for drag ends; axe on the dialog and reorder mode.
