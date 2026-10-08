# U3c Faster Menu Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin → Menu gets search, Duplicate, bulk price change with preview, and reordering of categories and dishes (drag plus Move up/down); new dishes go last.

**Architecture:** One pure `applyPriceChange` plus request schemas in `packages/shared`, used by the API and the web preview. The API gains two reorder routes and a bulk price route on the menu controller (transactions, audit). The web menu feature gains pure `filterMenu`/`moveId`/`moveBy`, reorder and bulk mutations, an `ItemRow`, a dnd-kit `SortableList`, a `BulkPriceDialog`, and `ItemEditor` copy mode.

**Tech Stack:** Zod 4 (shared), NestJS 11 + Prisma 6 (API), React 19 + TanStack Query + Tailwind 4 kit + `@dnd-kit/core`/`@dnd-kit/sortable` (web); Vitest (shared, web), Jest + supertest (API e2e).

**Spec:** `docs/superpowers/specs/2026-10-08-u3c-faster-menu-editing-design.md`

## Global Constraints

- All new routes require `menu.manage`, are outlet-scoped and write an audit entry (`menu.category.reorder`, `menu.item.reorder`, `menu.price.bulk`).
- Reorder bodies must be exactly the active set (no duplicates, no missing, no foreign ids) → else 400 `INVALID_REFERENCE` (existing `invalidReference('ids')`).
- Bulk change: `itemIds` 1..500; percent `basisPoints` −9000..20000 non-zero; amount `paise` −1,000,000..1,000,000 non-zero; `roundTo` ∈ {100, 500, 1000}; both dine-in and parcel prices; packaging untouched; any result < 0 or > `MAX_PRICE_PAISE` → 400 `VALIDATION` naming dish and size, nothing saved; ₹0 stays ₹0 for percent.
- Rounding: nearest `roundTo`, halves up.
- Reordering in the UI always has Move up/Move down buttons (non-drag alternative); dnd-kit only for pointer and touch; handle is not keyboard-focusable.
- dnd-kit is imported only from the lazy Menu page's modules (keep the initial bundle within budget).
- Commands: shared `pnpm --filter @rpos/shared test`; API `pnpm --filter @rpos/api test:e2e -- menu`; web from `apps/web`: `npx vitest run <path>`, `npx tsc --noEmit -p tsconfig.json`; lint `pnpm lint` (root).

## Review Focus

1. Route order: `PUT /api/menu/categories/order` must not be swallowed by `PUT /api/menu/categories/:id` (UUID pipe would 400).
2. A reorder sent after someone else archived or added a dish → 400, nothing reordered; the screen returns to the server's order.
3. A bulk decrease that would take one size below ₹0 → nothing at all saved (one transaction), message names the dish and size; the preview disables saving first.
4. Duplicating a dish must not send variant ids (it would edit the original's sizes) and must not reuse the exact name.
5. Search must ignore case and extra spaces and hide reorder controls while active.

Each is pinned by a test in Tasks 1–5.

---

### Task 1: Shared price maths and schemas

**Files:**
- Modify: `packages/shared/src/menu.ts`
- Test: `packages/shared/src/menu.test.ts`

**Interfaces:**
- Produces: `type PriceChange = { kind: 'percent'; basisPoints: number } | { kind: 'amount'; paise: number }`; `applyPriceChange(price: number, change: PriceChange, roundTo: number): number`; `ROUND_TO_PAISE = [100, 500, 1000] as const`; `reorderSchema` / `type ReorderRequest = { ids: string[] }`; `priceChangeSchema`; `bulkPriceSchema` / `type BulkPriceRequest = { itemIds: string[]; change: PriceChange; roundTo: 100 | 500 | 1000 }`.

- [ ] **Step 1: Write the failing tests** (append to `menu.test.ts`, adding the new names to its import from `./menu`)

```ts
describe('applyPriceChange', () => {
  const pct = (basisPoints: number) => ({ kind: 'percent' as const, basisPoints });
  const amt = (paise: number) => ({ kind: 'amount' as const, paise });

  it('raises and lowers by a percentage, rounded to ₹1, ₹5 or ₹10', () => {
    expect(applyPriceChange(18000, pct(500), 100)).toBe(18900);
    expect(applyPriceChange(18000, pct(500), 500)).toBe(19000);
    expect(applyPriceChange(33000, pct(500), 500)).toBe(34500);
    expect(applyPriceChange(18000, pct(500), 1000)).toBe(19000);
    expect(applyPriceChange(18000, pct(-1000), 100)).toBe(16200);
  });

  it('rounds halves up', () => {
    expect(applyPriceChange(12250, amt(0), 500)).toBe(12500);
    expect(applyPriceChange(12249, amt(0), 500)).toBe(12000);
  });

  it('adds or takes away rupees, and can go below zero for the caller to refuse', () => {
    expect(applyPriceChange(18000, amt(2000), 100)).toBe(20000);
    expect(applyPriceChange(18000, amt(-20000), 100)).toBe(-2000);
  });

  it('keeps a free item free for percentages only', () => {
    expect(applyPriceChange(0, pct(1000), 100)).toBe(0);
    expect(applyPriceChange(0, amt(1000), 100)).toBe(1000);
  });
});

describe('bulk menu schemas', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const id2 = '00000000-0000-4000-8000-000000000002';

  it('accepts a reorder only with each id once', () => {
    expect(reorderSchema.safeParse({ ids: [id, id2] }).success).toBe(true);
    expect(reorderSchema.safeParse({ ids: [id, id] }).success).toBe(false);
    expect(reorderSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it('accepts a bulk price change within limits', () => {
    const ok = { itemIds: [id], change: { kind: 'percent', basisPoints: 500 }, roundTo: 500 };
    expect(bulkPriceSchema.safeParse(ok).success).toBe(true);
    for (const bad of [
      { ...ok, itemIds: [] },
      { ...ok, roundTo: 200 },
      { ...ok, change: { kind: 'percent', basisPoints: 0 } },
      { ...ok, change: { kind: 'percent', basisPoints: -9500 } },
      { ...ok, change: { kind: 'amount', paise: 2_000_000 } },
      { ...ok, change: { kind: 'amount', paise: 1.5 } },
    ]) {
      expect(bulkPriceSchema.safeParse(bad).success).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rpos/shared test`
Expected: FAIL — `applyPriceChange` / schemas not exported.

- [ ] **Step 3: Implement** (append to `menu.ts`)

```ts
// ---------- bulk menu editing ----------

export const ROUND_TO_PAISE = [100, 500, 1000] as const;

export type PriceChange =
  | { kind: 'percent'; basisPoints: number }
  | { kind: 'amount'; paise: number };

/**
 * The price after a bulk change, rounded to the nearest `roundTo` paise (halves up). A free item
 * stays free under a percentage. The result can be negative: callers refuse that.
 */
export function applyPriceChange(price: number, change: PriceChange, roundTo: number): number {
  if (change.kind === 'percent' && price === 0) return 0;
  const raw =
    change.kind === 'percent'
      ? (price * (10_000 + change.basisPoints)) / 10_000
      : price + change.paise;
  return Math.floor(raw / roundTo + 0.5) * roundTo;
}

const idList = z
  .array(z.uuid())
  .min(1)
  .max(500)
  .refine((ids) => new Set(ids).size === ids.length, 'Each entry may appear only once');

export const reorderSchema = z.strictObject({ ids: idList });
export type ReorderRequest = z.infer<typeof reorderSchema>;

const nonZero = (n: number) => n !== 0;

export const priceChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('percent'),
    basisPoints: z.number().int().min(-9000).max(20_000).refine(nonZero, 'Enter a change'),
  }),
  z.strictObject({
    kind: z.literal('amount'),
    paise: z.number().int().min(-1_000_000).max(1_000_000).refine(nonZero, 'Enter a change'),
  }),
]);

export const bulkPriceSchema = z.strictObject({
  itemIds: idList,
  change: priceChangeSchema,
  roundTo: z.union([z.literal(100), z.literal(500), z.literal(1000)]),
});
export type BulkPriceRequest = z.infer<typeof bulkPriceSchema>;
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @rpos/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): bulk price maths and menu reorder schemas"
```

---

### Task 2: API reorder and sort order for new entries

**Files:**
- Modify: `apps/api/src/menu/menu.controller.ts`, `apps/api/src/menu/menu.service.ts`
- Test: `apps/api/test/menu.e2e-spec.ts`

**Interfaces:**
- Consumes: `reorderSchema`, `ReorderRequest` (Task 1).
- Produces: `PUT /api/menu/categories/order` and `PUT /api/menu/categories/:id/items/order`, both `{ ids }` → 200 `{ updated: number }`.

- [ ] **Step 1: Write the failing tests** (inside `describe('menu')`, after the existing helpers)

```ts
  async function order(): Promise<[string, string[]][]> {
    const res = await ctx.http().get('/api/menu').set(as(waiter)).expect(200);
    return (res.body.categories as { name: string; items: { name: string }[] }[]).map((c) => [
      c.name,
      c.items.map((i) => i.name),
    ]);
  }

  const putOrder = (path: string, ids: string[], token = owner) =>
    ctx.http().put(`/api/menu/${path}`).set(as(token)).send({ ids });

  it('keeps the order owners set, and adds new dishes and categories last', async () => {
    const starters = await category('Starters');
    const mains = await category('Mains');
    const paneer = (await createItem(itemBody(starters, { name: 'Paneer Tikka' })).expect(201))
      .body.id as string;
    const aloo = (await createItem(itemBody(starters, { name: 'Aloo Tikki' })).expect(201)).body
      .id as string;
    // New dishes go last, so Paneer (first added) comes before Aloo.
    expect(await order()).toEqual([
      ['Starters', ['Paneer Tikka', 'Aloo Tikki']],
      ['Mains', []],
    ]);

    await putOrder('categories/order', [mains, starters], manager).expect(200);
    await putOrder(`categories/${starters}/items/order`, [aloo, paneer], manager).expect(200);
    await createItem(itemBody(starters, { name: 'Chilli Paneer' })).expect(201);
    await category('Drinks');

    expect(await order()).toEqual([
      ['Mains', []],
      ['Starters', ['Aloo Tikki', 'Paneer Tikka', 'Chilli Paneer']],
      ['Drinks', []],
    ]);
    const actions = (await ctx.prisma.auditEntry.findMany()).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['menu.category.reorder', 'menu.item.reorder']));
  });

  it('refuses an order that is not exactly the active categories or dishes', async () => {
    const starters = await category('Starters');
    const mains = await category('Mains');
    const paneer = (await createItem(itemBody(starters)).expect(201)).body.id as string;
    const curry = (await createItem(itemBody(mains, { name: 'Dal' })).expect(201)).body.id as string;
    const other = await createOutlet(ctx.prisma);
    const foreign = await ctx.prisma.category.create({
      data: { outletId: other.id, stationId: station.id, name: 'Elsewhere' },
    });

    await putOrder('categories/order', [starters]).expect(400);
    await putOrder('categories/order', [starters, starters]).expect(400);
    await putOrder('categories/order', [starters, mains, foreign.id]).expect(400);
    await putOrder(`categories/${starters}/items/order`, [paneer, curry]).expect(400);
    await putOrder(`categories/${foreign.id}/items/order`, [paneer]).expect(404);
    await putOrder('categories/order', [mains, starters], waiter).expect(403);
    expect((await order()).map(([name]) => name)).toEqual(['Starters', 'Mains']);
  });
```

If `createOutlet` is not imported in this file yet, add it to the `./helpers` import.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rpos/api test:e2e -- menu`
Expected: FAIL — order is alphabetical (Aloo first) and the routes do not exist.

- [ ] **Step 3: Controller routes**

In `menu.controller.ts` import `reorderSchema, type ReorderRequest` from `@rpos/shared`. Add **before** the `@Put('categories/:id')` route:

```ts
  @Put('categories/order')
  @RequirePermissions('menu.manage')
  reorderCategories(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(reorderSchema)) body: ReorderRequest,
  ) {
    return this.menu.reorderCategories(user, body.ids);
  }

  @Put('categories/:id/items/order')
  @RequirePermissions('menu.manage')
  reorderItems(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(reorderSchema)) body: ReorderRequest,
  ) {
    return this.menu.reorderItems(user, id, body.ids);
  }
```

- [ ] **Step 4: Service**

In `menu.service.ts` add near the top (after the type aliases):

```ts
/** True when `ids` is exactly the set `active`, each once. */
const sameSet = (active: string[], ids: string[]) =>
  active.length === ids.length && new Set(ids).size === ids.length && ids.every((id) => active.includes(id));
```

In `createCategory`, replace `sortOrder: request.sortOrder ?? 0,` with `sortOrder: request.sortOrder ?? (await this.nextCategoryOrder(actor.outletId)),` and in `createItem` inside the transaction, before `tx.item.create`, add:

```ts
      const last = await tx.item.aggregate({
        where: { categoryId: request.categoryId, archivedAt: null },
        _max: { sortOrder: true },
      });
```

and in its `data` add `sortOrder: (last._max.sortOrder ?? -1) + 1,`.

Add the methods (e.g. after `archiveCategory`):

```ts
  private async nextCategoryOrder(outletId: string) {
    const last = await this.prisma.category.aggregate({
      where: { outletId, archivedAt: null },
      _max: { sortOrder: true },
    });
    return (last._max.sortOrder ?? -1) + 1;
  }

  /** Saves the order of every active category: `ids` must be exactly those, each once. */
  async reorderCategories(actor: AuthUser, ids: string[]) {
    const active = await this.prisma.category.findMany({
      where: { outletId: actor.outletId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!sameSet(active.map((c) => c.id), ids)) throw invalidReference('ids');
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    const names = new Map(active.map((c) => [c.id, c.name]));
    await this.record(actor, 'menu.category.reorder', 'category', ids[0]!, undefined, {
      order: ids.map((id) => names.get(id)),
    });
    return { updated: ids.length };
  }

  /** Saves the order of every active dish in one category. */
  async reorderItems(actor: AuthUser, categoryId: string, ids: string[]) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, outletId: actor.outletId, archivedAt: null },
    });
    if (!category) throw notFound('Category');
    const active = await this.prisma.item.findMany({
      where: { categoryId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!sameSet(active.map((i) => i.id), ids)) throw invalidReference('ids');
    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.item.update({ where: { id }, data: { sortOrder: index } })),
    );
    const names = new Map(active.map((i) => [i.id, i.name]));
    await this.record(actor, 'menu.item.reorder', 'category', categoryId, undefined, {
      order: ids.map((id) => names.get(id)),
    });
    return { updated: ids.length };
  }
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @rpos/api test:e2e -- menu`
Expected: PASS (all menu tests; if an older test relied on alphabetical order of dishes created in another order, update its expectation to creation order and note it in the commit).

- [ ] **Step 6: Commit**

```bash
git add apps/api packages/shared
git commit -m "feat(api): reorder menu categories and dishes; new entries go last"
```

---

### Task 3: API bulk price change

**Files:**
- Modify: `apps/api/src/menu/menu.controller.ts`, `apps/api/src/menu/menu.service.ts`
- Test: `apps/api/test/menu.e2e-spec.ts`

**Interfaces:**
- Consumes: `applyPriceChange`, `bulkPriceSchema`, `BulkPriceRequest`, `MAX_PRICE_PAISE` (Task 1).
- Produces: `POST /api/menu/prices` → 201 `{ updated: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
  const bulk = (body: object, token = owner) =>
    ctx.http().post('/api/menu/prices').set(as(token)).send(body);

  it('changes prices in bulk with rounding and keeps a record', async () => {
    const starters = await category();
    const id = (await createItem(itemBody(starters)).expect(201)).body.id as string;

    const res = await bulk(
      { itemIds: [id], change: { kind: 'percent', basisPoints: 500 }, roundTo: 500 },
      manager,
    ).expect(201);
    expect(res.body).toEqual({ updated: 2 });
    let [item] = await menuItems();
    expect(item!.variants.map((v) => [v.dineInPrice, v.parcelPrice, v.packagingCharge])).toEqual([
      [19000, 19000, 0],
      [33500, 34500, 1000],
    ]);

    await bulk({ itemIds: [id], change: { kind: 'amount', paise: -5000 }, roundTo: 100 }).expect(201);
    [item] = await menuItems();
    expect(item!.variants[0]!.dineInPrice).toBe(14000);

    const audit = await ctx.prisma.auditEntry.findFirst({ where: { action: 'menu.price.bulk' } });
    expect(JSON.stringify(audit?.after)).toContain('"before":{"dineIn":18000,"parcel":18000}');
  });

  it('saves nothing when a price would go below ₹0, and refuses others', async () => {
    const starters = await category();
    const id = (await createItem(itemBody(starters)).expect(201)).body.id as string;
    const res = await bulk({
      itemIds: [id],
      change: { kind: 'amount', paise: -20000 },
      roundTo: 100,
    }).expect(400);
    expect(res.body.message).toBe('Paneer Tikka Half would go below ₹0.');
    expect((await menuItems())[0]!.variants.map((v) => v.dineInPrice)).toEqual([18000, 32000]);

    await ctx.http().post(`/api/menu/items/${id}/archive`).set(as(owner)).expect(201);
    await bulk({
      itemIds: [id],
      change: { kind: 'percent', basisPoints: 500 },
      roundTo: 100,
    }).expect(400);
    await bulk(
      { itemIds: [id], change: { kind: 'percent', basisPoints: 500 }, roundTo: 100 },
      waiter,
    ).expect(403);
  });
```

Check the archive route's status code in the existing tests (`grep -n "archive" apps/api/test/menu.e2e-spec.ts`) and use it.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @rpos/api test:e2e -- menu`
Expected: FAIL — 404 for `POST /api/menu/prices`.

- [ ] **Step 3: Controller**

Import `bulkPriceSchema, type BulkPriceRequest` and add:

```ts
  @Post('prices')
  @RequirePermissions('menu.manage')
  bulkPrices(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(bulkPriceSchema)) body: BulkPriceRequest,
  ) {
    return this.menu.bulkPrices(user, body);
  }
```

- [ ] **Step 4: Service**

Imports: `import { HttpStatus, Injectable } from '@nestjs/common';`, `import { applyPriceChange, MAX_PRICE_PAISE, type BulkPriceRequest } from '@rpos/shared';` (merge with the existing `@rpos/shared` type import), `import { ApiError } from '../common/api-error';`.

```ts
  /**
   * Changes the dine-in and parcel price of every size of the given dishes in one go. If any
   * price would fall below ₹0 or above the limit, nothing is saved.
   */
  async bulkPrices(actor: AuthUser, request: BulkPriceRequest) {
    const items = await this.prisma.item.findMany({
      where: { id: { in: request.itemIds }, outletId: actor.outletId, archivedAt: null },
      include: { variants: { where: { archivedAt: null }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (items.length !== request.itemIds.length) throw invalidReference('itemIds');

    const changes = items.flatMap((item) =>
      item.variants.map((variant) => ({
        item,
        variant,
        dineIn: applyPriceChange(variant.dineInPrice, request.change, request.roundTo),
        parcel: applyPriceChange(variant.parcelPrice, request.change, request.roundTo),
      })),
    );
    const bad = changes.find(
      (c) => c.dineIn < 0 || c.parcel < 0 || c.dineIn > MAX_PRICE_PAISE || c.parcel > MAX_PRICE_PAISE,
    );
    if (bad) {
      const where = bad.dineIn < 0 || bad.parcel < 0 ? 'below ₹0' : 'above the highest price';
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION',
        `${bad.item.name} ${bad.variant.name} would go ${where}.`,
      );
    }

    await this.prisma.$transaction(
      changes.map((c) =>
        this.prisma.itemVariant.update({
          where: { id: c.variant.id },
          data: { dineInPrice: c.dineIn, parcelPrice: c.parcel },
        }),
      ),
    );
    await this.record(actor, 'menu.price.bulk', 'item', items[0]!.id, undefined, {
      change: request.change,
      roundTo: request.roundTo,
      prices: changes.map((c) => ({
        item: c.item.name,
        variant: c.variant.name,
        before: { dineIn: c.variant.dineInPrice, parcel: c.variant.parcelPrice },
        after: { dineIn: c.dineIn, parcel: c.parcel },
      })),
    });
    return { updated: changes.length };
  }
```

- [ ] **Step 5: Run to verify they pass, typecheck, commit**

Run: `pnpm --filter @rpos/api test:e2e -- menu` (PASS) and `pnpm --filter @rpos/api exec tsc --noEmit` (no errors).

```bash
git add apps/api
git commit -m "feat(api): change menu prices in bulk with rounding"
```

---

### Task 4: Web search, Duplicate, and the menu helpers

**Files:**
- Create: `apps/web/src/features/menu/menuOrder.ts` (`filterMenu`, `moveId`, `moveBy`)
- Test: `apps/web/src/features/menu/menuOrder.test.ts`
- Create: `apps/web/src/features/menu/components/ItemRow.tsx`
- Modify: `apps/web/src/features/menu/components/ItemEditor.tsx` (copy mode)
- Modify: `apps/web/src/features/menu/pages/MenuPage.tsx` (search, Duplicate, use `ItemRow`)
- Test: `apps/web/src/features/menu/pages/MenuPages.test.tsx`

**Interfaces:**
- Produces: `filterMenu(categories: MenuCategory[], query: string): MenuCategory[]`; `moveId(ids: string[], from: string, to: string): string[]`; `moveBy(ids: string[], id: string, step: -1 | 1): string[]`; `ItemRow({ item, actions }: { item: MenuItem; actions: ReactNode })`; `ItemEditor` prop `copyFrom?: MenuItem | null`.

- [ ] **Step 1: Write the failing tests**

`menuOrder.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterMenu, moveBy, moveId } from './menuOrder';
import type { MenuCategory } from './types';

const cat = (name: string, items: { name: string; sizes?: string[] }[]) =>
  ({
    id: name,
    name,
    items: items.map((i) => ({
      id: i.name,
      name: i.name,
      variants: (i.sizes ?? ['Regular']).map((v) => ({ id: `${i.name}-${v}`, name: v })),
    })),
  }) as unknown as MenuCategory;

describe('filterMenu', () => {
  const menu = [
    cat('Starters', [{ name: 'Paneer Tikka' }, { name: 'Aloo Tikki' }]),
    cat('Mains', [{ name: 'Kadai Paneer' }, { name: 'Dal', sizes: ['Half', 'Full'] }]),
  ];

  it('keeps matching dishes in their categories, ignoring case and extra spaces', () => {
    expect(filterMenu(menu, '  PANEER ').map((c) => [c.name, c.items.map((i) => i.name)])).toEqual([
      ['Starters', ['Paneer Tikka']],
      ['Mains', ['Kadai Paneer']],
    ]);
  });

  it('matches size names and drops empty categories', () => {
    expect(filterMenu(menu, 'half').map((c) => c.name)).toEqual(['Mains']);
    expect(filterMenu(menu, 'pizza')).toEqual([]);
    expect(filterMenu(menu, '   ')).toBe(menu);
  });
});

describe('moving ids', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('moves an id to where another one is', () => {
    expect(moveId(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveId(ids, 'a', 'a')).toBe(ids);
  });
  it('moves one step up or down, staying put at the ends', () => {
    expect(moveBy(ids, 'b', -1)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveBy(ids, 'b', 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveBy(ids, 'a', -1)).toBe(ids);
    expect(moveBy(ids, 'd', 1)).toBe(ids);
  });
});
```

Add to `MenuPages.test.tsx` (inside the item-editor `describe`, reusing `asManager`, `baseApi`, `callsTo`):

```tsx
  it('narrows the menu as you search and clears again', async () => {
    asManager();
    baseApi({});
    renderRoute('/admin/menu');
    expect(await screen.findByText('Veg Soup')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No dishes match "zzz"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Veg Soup')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: '  veg SOUP ' },
    });
    expect(screen.getByText('1 dish matches "veg SOUP"')).toBeInTheDocument();
  });

  it('duplicates a dish as a new one without the old size ids', async () => {
    asManager();
    const mock = baseApi({
      'POST /api/menu/items': ({ body }) => json({ id: 'i2', ...(body as object) }, 201),
    });
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Veg Soup' }));
    expect(screen.getByRole('heading', { name: 'New item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Veg Soup (copy)');
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await expect.poll(() => callsTo(mock, 'POST', '/api/menu/items').length).toBe(1);
    const sent = JSON.parse(String(callsTo(mock, 'POST', '/api/menu/items')[0]![1]!.body));
    expect(sent.name).toBe('Veg Soup (copy)');
    expect(sent.variants.every((v: { id?: string }) => v.id === undefined)).toBe(true);
    expect(sent.variants[0].dineInPrice).toBe(9000);
  });
```

Check `ItemEditor`'s field labels and save button text (`grep -n "label=\|Save" src/features/menu/components/ItemEditor.tsx`) and use them in the duplicate test (the name field label and the submit text).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/menu`
Expected: FAIL — `./menuOrder` missing; no search box; no Duplicate button.

- [ ] **Step 3: `menuOrder.ts`**

```ts
import type { MenuCategory } from './types';

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Dishes whose name or a size name contains the query, kept in their categories. */
export function filterMenu(categories: MenuCategory[], query: string): MenuCategory[] {
  const q = tidy(query);
  if (!q) return categories;
  return categories
    .map((c) => ({
      ...c,
      items: c.items.filter(
        (i) => tidy(i.name).includes(q) || i.variants.some((v) => tidy(v.name).includes(q)),
      ),
    }))
    .filter((c) => c.items.length > 0);
}

/** `from` moved to where `to` is (a drag ending over another row). */
export function moveId(ids: string[], from: string, to: string): string[] {
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0 || a === b) return ids;
  const next = [...ids];
  next.splice(a, 1);
  next.splice(b, 0, from);
  return next;
}

/** One step up (-1) or down (1); unchanged at the ends. */
export function moveBy(ids: string[], id: string, step: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  return moveId(ids, id, ids[j]!);
}
```

- [ ] **Step 4: `ItemRow.tsx`**

```tsx
import type { ReactNode } from 'react';
import { rupees } from '@/shared/lib/money';
import { FOOD_DOT, FOOD_LABEL, type MenuItem } from '../types';

/** One dish in Admin → Menu: name, badges, sizes and prices, and its actions on the right. */
export function ItemRow({ item, actions }: { item: MenuItem; actions: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          <span
            role="img"
            aria-label={FOOD_LABEL[item.foodType]}
            className={`inline-block h-2.5 w-2.5 rounded-full ${FOOD_DOT[item.foodType]}`}
          />
          {item.name}
          {item.isCombo && <span className="text-xs text-subtle">combo</span>}
          {!item.isAvailable && (
            <span className="rounded bg-amber-50 px-1.5 text-xs text-amber-800">out of stock</span>
          )}
        </span>
        <span className="text-sm text-muted">
          {item.variants.map((v) => `${v.name} ${rupees(v.dineInPrice)}`).join(' · ')}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
```

- [ ] **Step 5: `ItemEditor` copy mode**

- `variantRows(item: MenuItem | null, keepIds = true)` and in its map use `id: keepIds ? v.id : undefined,`.
- Add prop `copyFrom = null` typed `copyFrom?: MenuItem | null` (document: "Pre-fills a new dish from this one (Duplicate)").
- At the top of the component add `const source = existing ?? copyFrom;` and change the initial state:

```tsx
  const [name, setName] = useState(
    existing?.name ?? (copyFrom ? `${copyFrom.name} (copy)` : ''),
  );
  const [description, setDescription] = useState(source?.description ?? '');
  const [foodType, setFoodType] = useState<FoodType>(source?.foodType ?? 'VEG');
  const [categoryId, setCategoryId] = useState(source?.categoryId ?? defaultCategoryId);
  const [taxRateId, setTaxRateId] = useState(source?.taxRate.id ?? taxRates[0]?.id ?? '');
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    variantRows(source, Boolean(existing)),
  );
  const [groupIds, setGroupIds] = useState<string[]>(source?.addonGroups.map((g) => g.id) ?? []);
  const [isCombo, setIsCombo] = useState(source?.isCombo ?? false);
  const [components, setComponents] = useState<ComponentRow[]>(
    source?.components.map((c) => ({
      key: nextKey++,
      variantId: c.variantId,
      quantity: String(c.quantity),
    })) ?? [],
  );
```

`useSaveItem(existing, onDone)` stays (no `existing` → POST). The heading already reads "New item" when `existing` is null.

- [ ] **Step 6: `MenuPage` search and Duplicate**

- Imports: `Input` from `@/shared/ui`, `Search, X` from `lucide-react`, `filterMenu` from `../menuOrder`, `ItemRow` from `../components/ItemRow`, `EmptyState`, `IconButton` from `@/shared/ui`.
- State: `const [query, setQuery] = useState('');` and `const [copying, setCopying] = useState<MenuItem | null>(null);`.
- Replace the dish `<li>` markup with:

```tsx
                  <li key={item.id} className="px-4 py-3">
                    <ItemRow item={item} actions={itemActions(item)} />
                  </li>
```

  with, inside `MenuPage`:

```tsx
  const itemActions = (item: MenuItem) => (
    <>
      <button type="button" className={secondaryButton} onClick={() => edit(item)}>
        Edit
      </button>
      <button
        type="button"
        className={secondaryButton}
        aria-label={`Duplicate ${item.name}`}
        onClick={() => duplicate(item)}
      >
        Duplicate
      </button>
      <button
        type="button"
        className={secondaryButton}
        onClick={() => setPending({ kind: 'item', item })}
      >
        Archive
      </button>
    </>
  );
  const edit = (item: MenuItem) => {
    setCopying(null);
    setEditing(item);
  };
  const duplicate = (item: MenuItem) => {
    setSelectedId(item.categoryId);
    setCopying(item);
    setEditing('new');
  };
```

  Every other `setEditing(...)` call also does `setCopying(null)` first (Add item, category switch, `onDone`).
- Pass `copyFrom={editing === 'new' ? copying : null}` to `ItemEditor` and use `key={editing === 'new' ? `new-${copying?.id ?? ''}` : editing.id}`.
- Search box, right under the `ErrorNote`s and above the grid:

```tsx
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
        />
        <Input
          type="search"
          aria-label="Search dishes"
          placeholder="Search dishes"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
```

- When `query.trim()` is not empty, the right-hand column renders search results instead of the selected category:

```tsx
  const results = filterMenu(categories, query);
  const matchCount = results.reduce((n, c) => n + c.items.length, 0);
```

```tsx
          {query.trim() ? (
            results.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title={`No dishes match "${query.trim()}"`}
                description="Check the spelling, or search for part of the name."
                action={
                  <button type="button" className={secondaryButton} onClick={() => setQuery('')}>
                    Clear search
                  </button>
                }
              />
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted">
                  {`${matchCount} ${matchCount === 1 ? 'dish matches' : 'dishes match'} "${query.trim()}"`}
                </p>
                {results.map((c) => (
                  <section key={c.id} aria-label={c.name} className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-muted">{c.name}</h3>
                    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                      {c.items.map((item) => (
                        <li key={item.id} className="px-4 py-3">
                          <ItemRow item={item} actions={itemActions(item)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )
          ) : selected ? (
            /* existing selected-category markup */
          ) : (
            /* existing "Add your first category" text */
          )}
```

  The editor (`ItemEditor` block) must render in both branches when `editing` is set: move it above this conditional.
- Also show a small "Clear search" `IconButton` (label "Clear search", icon `X`) inside the search field when `query` is not empty, positioned `absolute right-1 top-1/2 -translate-y-1/2` with size `sm`; the EmptyState button keeps the same accessible name, so the test's `getByRole('button', { name: 'Clear search' })` must then use `getAllByRole(...)[0]` — instead, label the field button "Clear" to keep names unique.

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run src/features/menu`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
git add apps/web/src/features/menu
git commit -m "feat(web): menu search and duplicate a dish"
```

---

### Task 5: Web bulk price dialog

**Files:**
- Modify: `apps/web/src/features/menu/api.ts`, `apps/web/src/features/menu/mutations.ts`
- Create: `apps/web/src/features/menu/components/BulkPriceDialog.tsx`
- Modify: `apps/web/src/features/menu/pages/MenuPage.tsx` (header button)
- Test: `apps/web/src/features/menu/components/BulkPriceDialog.test.tsx`

**Interfaces:**
- Consumes: `applyPriceChange`, `parseRupees`, `MAX_PRICE_PAISE`, `BulkPriceRequest`, `PriceChange` from `@rpos/shared`; `useNotify` from `@/features/notifications`.
- Produces: `bulkPrices(body: BulkPriceRequest): Promise<{ updated: number }>`; `useBulkPrices(onDone: (result: { updated: number }) => void)`; `BulkPriceDialog({ categories, onClose }: { categories: MenuCategory[]; onClose: () => void })`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { expectNoAxeViolations } from '@/test/a11y';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import type { MenuCategory } from '../types';
import { BulkPriceDialog } from './BulkPriceDialog';

const item = (id: string, name: string, variants: [string, number, number][]) => ({
  id,
  name,
  categoryId: 'c1',
  variants: variants.map(([vName, dineInPrice, parcelPrice], i) => ({
    id: `${id}-${i}`,
    name: vName,
    dineInPrice,
    parcelPrice,
    packagingCharge: 0,
  })),
});

const CATEGORIES = [
  {
    id: 'c1',
    name: 'Starters',
    items: [
      item('00000000-0000-4000-8000-0000000000a1', 'Paneer Tikka', [
        ['Half', 18000, 18000],
        ['Full', 32000, 33000],
      ]),
    ],
  },
  {
    id: 'c2',
    name: 'Breads',
    items: [item('00000000-0000-4000-8000-0000000000b1', 'Roti', [['Regular', 2000, 2000]])],
  },
] as unknown as MenuCategory[];

function open(handlers = {}) {
  useSession.getState().setSession(sessionBody('MANAGER', ['menu.manage']));
  const mock = mockApi(handlers);
  const onClose = vi.fn();
  renderWithProviders(<BulkPriceDialog categories={CATEGORIES} onClose={onClose} />);
  return { mock, onClose };
}

describe('BulkPriceDialog', () => {
  it('previews every changed price for the whole menu', () => {
    open();
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Round to'), { target: { value: '500' } });
    // Roti ₹20 + 5% = ₹21, which rounds back to ₹20: unchanged, so not listed.
    expect(screen.getByText('2 prices will change')).toBeInTheDocument();
    const preview = within(screen.getByRole('table', { name: 'New prices' }));
    expect(preview.getByRole('row', { name: /Paneer Tikka Full/ })).toHaveTextContent(
      'Paneer Tikka Full₹320 → ₹335₹330 → ₹345',
    );
    expect(preview.queryByRole('row', { name: /Roti/ })).toBeNull();
  });

  it('limits the change to one category and saves it', async () => {
    const { mock, onClose } = open({
      'POST /api/menu/prices': () => json({ updated: 1 }, 201),
      'GET /api/menu': () => json({ categories: [] }),
    });
    fireEvent.click(screen.getByLabelText('One category'));
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'c2' } });
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'up-rupees' } });
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update 1 price' }));
    await expect.poll(() => onClose.mock.calls.length).toBe(1);
    expect(JSON.parse(String(callsTo(mock, 'POST', '/api/menu/prices')[0]![1]!.body))).toEqual({
      itemIds: ['00000000-0000-4000-8000-0000000000b1'],
      change: { kind: 'amount', paise: 200 },
      roundTo: 100,
    });
  });

  it('will not save a decrease that takes a price below ₹0', () => {
    open();
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'down-rupees' } });
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '50' } });
    expect(
      screen.getByText('Some prices would go below ₹0. Choose a smaller decrease.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Update/ })).toBeDisabled();
  });

  it('picks single dishes', () => {
    open();
    fireEvent.click(screen.getByLabelText('Pick dishes'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Roti' }));
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '10' } });
    expect(screen.getByText('1 price will change')).toBeInTheDocument();
  });

  it('has no accessibility problems', async () => {
    open();
    fireEvent.change(screen.getByLabelText('By how much'), { target: { value: '5' } });
    await expectNoAxeViolations();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/menu/components/BulkPriceDialog.test.tsx`
Expected: FAIL — `./BulkPriceDialog` missing.

- [ ] **Step 3: API and mutation**

`api.ts`:

```ts
import type { BulkPriceRequest } from '@rpos/shared';

export const bulkPrices = (body: BulkPriceRequest) =>
  apiFetch<{ updated: number }>('/api/menu/prices', { method: 'POST', body });
```

`mutations.ts`:

```ts
/** Bulk price change; the menu refreshes before `onDone` so the new prices show at once. */
export const useBulkPrices = (onDone: (result: { updated: number }) => void) =>
  useInvalidatingMutation({
    mutationFn: bulkPrices,
    invalidates: [menuKeys.all],
    onSuccess: onDone,
    afterRefresh: true,
  });
```

- [ ] **Step 4: `BulkPriceDialog.tsx`**

```tsx
import {
  applyPriceChange,
  MAX_PRICE_PAISE,
  parseRupees,
  type PriceChange,
} from '@rpos/shared';
import { useId, useMemo, useState } from 'react';
import { useNotify } from '@/features/notifications';
import { rupees } from '@/shared/lib/money';
import { Button, describeError, Dialog, ErrorNote, Field, Input, Select } from '@/shared/ui';
import { useBulkPrices } from '../mutations';
import type { MenuCategory } from '../types';

type Scope = 'all' | 'category' | 'pick';
type Mode = 'up-percent' | 'down-percent' | 'up-rupees' | 'down-rupees';

const MODES: { value: Mode; label: string }[] = [
  { value: 'up-percent', label: 'Increase by %' },
  { value: 'down-percent', label: 'Decrease by %' },
  { value: 'up-rupees', label: 'Increase by ₹' },
  { value: 'down-rupees', label: 'Decrease by ₹' },
];

/** "5" or "2.5" in the box, as a signed change; null while it is not a usable number. */
function toChange(mode: Mode, amount: string): PriceChange | null {
  // parseRupees reads two decimals: 5 → 500, which is 5% in basis points or ₹5 in paise.
  const hundredths = parseRupees(amount.trim());
  if (hundredths === null || hundredths === 0) return null;
  const sign = mode.startsWith('down') ? -1 : 1;
  return mode.endsWith('percent')
    ? { kind: 'percent', basisPoints: sign * hundredths }
    : { kind: 'amount', paise: sign * hundredths };
}

/** Raise or lower many prices at once, with every old → new price shown before saving. */
export function BulkPriceDialog({
  categories,
  onClose,
}: {
  categories: MenuCategory[];
  onClose: () => void;
}) {
  const id = useId();
  const notify = useNotify();
  const [scope, setScope] = useState<Scope>('all');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('up-percent');
  const [amount, setAmount] = useState('');
  const [roundTo, setRoundTo] = useState<100 | 500 | 1000>(100);
  const save = useBulkPrices(({ updated }) => {
    notify({ text: `Prices updated for ${updated} ${updated === 1 ? 'size' : 'sizes'}`, tone: 'success' });
    onClose();
  });

  const allItems = categories.flatMap((c) => c.items);
  const items =
    scope === 'all'
      ? allItems
      : scope === 'category'
        ? (categories.find((c) => c.id === categoryId)?.items ?? [])
        : allItems.filter((i) => picked.includes(i.id));
  const change = toChange(mode, amount);

  const rows = useMemo(
    () =>
      change
        ? items.flatMap((item) =>
            item.variants.map((v) => ({
              key: v.id,
              label: `${item.name} ${v.name}`,
              dineIn: [v.dineInPrice, applyPriceChange(v.dineInPrice, change, roundTo)] as const,
              parcel: [v.parcelPrice, applyPriceChange(v.parcelPrice, change, roundTo)] as const,
            })),
          )
        : [],
    [items, change, roundTo],
  ).filter((r) => r.dineIn[0] !== r.dineIn[1] || r.parcel[0] !== r.parcel[1]);
  const below = rows.some((r) => r.dineIn[1] < 0 || r.parcel[1] < 0);
  const above = rows.some((r) => r.dineIn[1] > MAX_PRICE_PAISE || r.parcel[1] > MAX_PRICE_PAISE);
  const count = rows.length;

  return (
    <Dialog label="Change prices" onClose={onClose} wide>
      <h2 className="text-lg font-semibold">Change prices</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Which dishes</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ['all', 'All dishes'],
              ['category', 'One category'],
              ['pick', 'Pick dishes'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={scope === value}
                onChange={() => setScope(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {scope === 'category' && (
          <Field id={`${id}-category`} label="Category">
            <Select
              id={`${id}-category`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {scope === 'pick' && (
          <ul className="max-h-56 overflow-y-auto rounded-md border border-border p-2 text-sm">
            {allItems.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={picked.includes(item.id)}
                    onChange={(e) =>
                      setPicked((ids) =>
                        e.target.checked ? [...ids, item.id] : ids.filter((x) => x !== item.id),
                      )
                    }
                  />
                  {item.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={`${id}-mode`} label="Change">
          <Select id={`${id}-mode`} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-amount`} label="By how much">
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field id={`${id}-round`} label="Round to">
          <Select
            id={`${id}-round`}
            value={roundTo}
            onChange={(e) => setRoundTo(Number(e.target.value) as 100 | 500 | 1000)}
          >
            <option value={100}>₹1</option>
            <option value={500}>₹5</option>
            <option value={1000}>₹10</option>
          </Select>
        </Field>
      </div>
      {change && (
        <>
          <p className="text-sm font-medium">{`${count} ${count === 1 ? 'price will' : 'prices will'} change`}</p>
          {count > 0 && (
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <table aria-label="New prices" className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2">Dish</th>
                    <th scope="col" className="px-3 py-2">Dine-in</th>
                    <th scope="col" className="px-3 py-2">Parcel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.key} className={r.dineIn[1] < 0 || r.parcel[1] < 0 ? 'bg-red-50' : ''}>
                      <th scope="row" className="px-3 py-2 font-medium">
                        {r.label}
                      </th>
                      <td className="px-3 py-2 tabular-nums">{`${rupees(r.dineIn[0])} → ${rupees(r.dineIn[1])}`}</td>
                      <td className="px-3 py-2 tabular-nums">{`${rupees(r.parcel[0])} → ${rupees(r.parcel[1])}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {below && (
        <p role="alert" className="text-sm text-red-700">
          Some prices would go below ₹0. Choose a smaller decrease.
        </p>
      )}
      {above && (
        <p role="alert" className="text-sm text-red-700">
          Some prices would go above the highest price allowed.
        </p>
      )}
      <ErrorNote message={save.isError ? describeError(save.error) : null} />
      <div className="flex flex-wrap gap-2">
        <Button
          loading={save.isPending}
          disabled={!change || count === 0 || below || above}
          onClick={() =>
            change &&
            save.mutate({
              itemIds: [...new Set(items.map((i) => i.id))],
              change,
              roundTo,
            })
          }
        >
          {`Update ${count} ${count === 1 ? 'price' : 'prices'}`}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
```

Notes for the executor:
- `rows` uses `useMemo` then `.filter` on its result; if lint flags the dependency on `items` (new array each render), drop `useMemo` and compute directly — the lists are small.
- Check the toast tone names in `features/notifications/store.ts` (`ToastTone`); use the success-like one.
- A negative `rupees()` value renders "-₹20" (U1 money format), which is what the below-₹0 row shows.

- [ ] **Step 5: Header button**

In `MenuPage.tsx`: state `const [bulk, setBulk] = useState(false);`; `PageHeader` gets

```tsx
        actions={
          <Button variant="secondary" disabled={!menu.data} onClick={() => setBulk(true)}>
            Change prices
          </Button>
        }
```

and render `{bulk && menu.data && <BulkPriceDialog categories={categories} onClose={() => setBulk(false)} />}` after the header.

- [ ] **Step 6: Run, typecheck, lint, commit**

Run: `npx vitest run src/features/menu`, `npx tsc --noEmit -p tsconfig.json`, `pnpm lint` (root). All green.

```bash
git add apps/web/src/features/menu
git commit -m "feat(web): change many menu prices at once with a preview"
```

---

### Task 6: Web reorder mode

**Files:**
- Modify: `apps/web/package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Modify: `apps/web/src/features/menu/api.ts`, `apps/web/src/features/menu/mutations.ts`
- Create: `apps/web/src/features/menu/components/SortableList.tsx`
- Modify: `apps/web/src/features/menu/pages/MenuPage.tsx`
- Test: `apps/web/src/features/menu/pages/MenuPages.test.tsx`

**Interfaces:**
- Consumes: `moveId`, `moveBy`, `ItemRow` (Task 4).
- Produces: `reorderCategories(ids)`, `reorderItems(categoryId, ids)`; `type Reorder = { kind: 'categories'; ids: string[] } | { kind: 'items'; categoryId: string; ids: string[] }`; `useReorder(onFailed: (error: Error) => void)`; `SortableList<T extends { id: string; name: string }>({ label, items, onMove, render })`.

- [ ] **Step 1: Install**

Run (root): `pnpm --filter @rpos/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

- [ ] **Step 2: Write the failing tests** (in `MenuPages.test.tsx`; the `menu` fixture has one category with Veg Soup — add a second dish "Tomato Soup" to the fixture's first category if it has only one, and update any test that counts its dishes)

```tsx
  it('reorders dishes with Move up and saves the new order', async () => {
    asManager();
    const mock = baseApi({
      [`PUT /api/menu/categories/${CAT}/items/order`]: () => json({ updated: 2 }),
    });
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Reorder' }));
    const ids = menu.categories[0]!.items.map((i) => i.id);
    const second = menu.categories[0]!.items[1]!;
    fireEvent.click(screen.getByRole('button', { name: `Move ${second.name} up` }));
    await expect
      .poll(() => callsTo(mock, 'PUT', `/api/menu/categories/${CAT}/items/order`).length)
      .toBe(1);
    expect(
      JSON.parse(String(callsTo(mock, 'PUT', `/api/menu/categories/${CAT}/items/order`)[0]![1]!.body)),
    ).toEqual({ ids: [ids[1], ids[0]] });
    expect(screen.queryByRole('button', { name: /^Duplicate/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getAllByRole('button', { name: /^Duplicate/ }).length).toBeGreaterThan(0);
  });

  it('puts the order back and says why when saving fails', async () => {
    asManager();
    baseApi({
      [`PUT /api/menu/categories/${CAT}/items/order`]: () =>
        json({ code: 'INVALID_REFERENCE', message: 'Something you picked is no longer available. Refresh and try again.' }, 400),
    });
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Reorder' }));
    const [first, second] = menu.categories[0]!.items;
    fireEvent.click(screen.getByRole('button', { name: `Move ${second!.name} up` }));
    expect(await screen.findByText(/no longer available/)).toBeInTheDocument();
    const rows = screen.getAllByRole('button', { name: /^Move .* down$/ });
    expect(rows[0]).toHaveAccessibleName(`Move ${first!.name} down`);
  });

  it('hides reorder controls while searching', async () => {
    asManager();
    baseApi({});
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Reorder' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dishes' }), {
      target: { value: 'soup' },
    });
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
  });
```

`baseApi` returns the mock; the `GET /api/menu` handler keeps returning the original fixture, so after the failure the refetch restores the original order.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/features/menu/pages`
Expected: FAIL — no Reorder button.

- [ ] **Step 4: API and mutation**

`api.ts`:

```ts
export const reorderCategories = (ids: string[]) =>
  apiFetch('/api/menu/categories/order', { method: 'PUT', body: { ids } });

export const reorderItems = (categoryId: string, ids: string[]) =>
  apiFetch(`/api/menu/categories/${categoryId}/items/order`, { method: 'PUT', body: { ids } });
```

`mutations.ts`:

```ts
export type Reorder =
  | { kind: 'categories'; ids: string[] }
  | { kind: 'items'; categoryId: string; ids: string[] };

const pick = <T extends { id: string }>(rows: T[], ids: string[]) =>
  ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is T => r !== undefined);

const inOrder =
  (move: Reorder): MenuPatch =>
  (menu) =>
    move.kind === 'categories'
      ? { categories: pick(menu.categories, move.ids) }
      : {
          categories: menu.categories.map((c) =>
            c.id === move.categoryId ? { ...c, items: pick(c.items, move.ids) } : c,
          ),
        };

/** Shows the new order at once; a refusal brings the server's order back. */
export function useReorder(onFailed: (error: Error) => void) {
  const client = useQueryClient();
  const patch = usePatchMenu();
  return useMutation({
    mutationFn: (move: Reorder) =>
      move.kind === 'categories'
        ? reorderCategories(move.ids)
        : reorderItems(move.categoryId, move.ids),
    onMutate: (move) => patch(inOrder(move)),
    onError: (error) => onFailed(error),
    onSettled: () => client.invalidateQueries({ queryKey: menuKeys.all }),
  });
}
```

(Import `reorderCategories`, `reorderItems` from `./api`.)

- [ ] **Step 5: `SortableList.tsx`**

```tsx
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/shared/ui';
import { moveBy, moveId } from '../menuOrder';

interface Row {
  id: string;
  name: string;
}

/**
 * A list that can be put in order: drag the grip with a mouse or finger, or use Move up / Move
 * down (keyboard, screen readers, one tap). `onMove` gets every id in the new order.
 */
export function SortableList<T extends Row>({
  label,
  items,
  onMove,
  render,
}: {
  label: string;
  items: T[];
  onMove: (ids: string[]) => void;
  render: (item: T) => ReactNode;
}) {
  const ids = items.map((i) => i.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onMove(moveId(ids, String(active.id), String(over.id)));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul
          aria-label={label}
          className="divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              first={index === 0}
              last={index === items.length - 1}
              onStep={(step) => onMove(moveBy(ids, item.id, step))}
            >
              {render(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  item,
  first,
  last,
  onStep,
  children,
}: {
  item: Row;
  first: boolean;
  last: boolean;
  onStep: (step: -1 | 1) => void;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 bg-surface px-2 py-2 ${isDragging ? 'relative z-10 shadow-overlay' : ''}`}
    >
      {/* Pointer and touch only; Move up/down below are the keyboard way. */}
      <div
        aria-hidden="true"
        {...listeners}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-subtle active:cursor-grabbing"
      >
        <GripVertical className="size-5" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      <IconButton
        label={`Move ${item.name} up`}
        variant="ghost"
        disabled={first}
        icon={<ArrowUp />}
        onClick={() => onStep(-1)}
      />
      <IconButton
        label={`Move ${item.name} down`}
        variant="ghost"
        disabled={last}
        icon={<ArrowDown />}
        onClick={() => onStep(1)}
      />
    </li>
  );
}
```

Check `IconButton`'s props in `shared/ui/Button.tsx` (`label`, `icon`, `variant`) and adapt if the icon is passed as children.

- [ ] **Step 6: `MenuPage` reorder mode**

- State: `const [reordering, setReordering] = useState(false);`, `const [reorderError, setReorderError] = useState<string | null>(null);`, `const reorder = useReorder((error) => setReorderError(describeError(error)));`.
- Header actions become (with Change prices from Task 5):

```tsx
          <>
            <Button variant="secondary" disabled={!menu.data} onClick={() => setBulk(true)}>
              Change prices
            </Button>
            <Button
              variant={reordering ? 'primary' : 'secondary'}
              disabled={!menu.data}
              onClick={() => {
                setReorderError(null);
                setEditing(null);
                setReordering((r) => !r);
              }}
            >
              {reordering ? 'Done' : 'Reorder'}
            </Button>
          </>
```

- `<ErrorNote message={reorderError} />` under the other notes.
- `const sorting = reordering && !query.trim();`
- Left column: when `sorting`, render instead of the category `<nav>`:

```tsx
            <SortableList
              label="Category order"
              items={categories}
              onMove={(ids) => {
                setReorderError(null);
                reorder.mutate({ kind: 'categories', ids });
              }}
              render={(c) => (
                <button
                  type="button"
                  className="min-h-11 w-full text-left text-sm font-medium"
                  onClick={() => setSelectedId(c.id)}
                >
                  {c.name}
                </button>
              )}
            />
```

- Right column dish list: when `sorting`, render

```tsx
              <SortableList
                label={`Dishes in ${selected.name}`}
                items={selected.items}
                onMove={(ids) => {
                  setReorderError(null);
                  reorder.mutate({ kind: 'items', categoryId: selected.id, ids });
                }}
                render={(item) => <ItemRow item={item} actions={null} />}
              />
```

  otherwise the existing `<ul>` with `ItemRow` and `itemActions`. Hide Edit/Archive category and Add item buttons while `sorting`.
- While `reordering`, show under the header: `<p className="text-sm text-muted">Drag the handles, or use the arrows. The POS, captain app and QR menu show this order.</p>`.

- [ ] **Step 7: Run, full checks, bundle, commit**

Run `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`, `pnpm lint` (root), and `npx vite build` in `apps/web`: the initial `index-*.js` gzip must stay ≤ 260 kB (dnd-kit must land in the Menu page chunk).

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): reorder menu categories and dishes by drag or arrows"
```

---

### Task 7: Real-app check

- [ ] **Step 1:** With api and web running as the dev owner: search "paneer"; duplicate Paneer Tikka and save; change prices +5% rounded to ₹5 on one category and check the preview matches what is saved; reorder two dishes with the arrows and by drag, reload and check the order stays; open the POS menu and check the order shows there. Check Admin → Menu at 375 px.
- [ ] **Step 2:** Commit any fix with a message naming it. Put test data back if needed (prices back with a −5% change is not exact — note it instead).
