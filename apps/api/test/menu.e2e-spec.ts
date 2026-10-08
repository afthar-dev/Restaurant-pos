import type { Outlet, Station, TaxRate } from '@prisma/client';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  readCookie,
  resetDatabase,
  type TestContext,
} from './helpers';

interface MenuItem {
  id: string;
  name: string;
  isAvailable: boolean;
  variants: {
    id: string;
    name: string;
    dineInPrice: number;
    parcelPrice: number;
    packagingCharge: number;
  }[];
  addonGroups: {
    id: string;
    name: string;
    addons: { id: string; name: string; price: number; isAvailable: boolean }[];
  }[];
  components: { variantId: string; itemName: string; variantName: string; quantity: number }[];
}

describe('menu', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let station: Station;
  let tax: TaxRate;
  let owner: string;
  let manager: string;
  let waiter: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    station = await ctx.prisma.station.create({ data: { outletId: outlet.id, name: 'Kitchen' } });
    tax = await ctx.prisma.taxRate.create({
      data: { outletId: outlet.id, name: 'GST 5%', cgstBp: 250, sgstBp: 250 },
    });
    const o = await createUser(ctx.prisma, outlet.id, { role: 'OWNER', password: 'owner-pass-1' });
    const m = await createUser(ctx.prisma, outlet.id, { role: 'MANAGER', password: 'mgr-pass-11' });
    const w = await createUser(ctx.prisma, outlet.id, { role: 'WAITER', pin: '1234' });
    owner = (await loginWithPassword(ctx, o.phone, 'owner-pass-1')).accessToken;
    manager = (await loginWithPassword(ctx, m.phone, 'mgr-pass-11')).accessToken;
    const device = await ctx
      .http()
      .post('/api/devices')
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Phone', type: 'CAPTAIN' });
    waiter = (
      await ctx
        .http()
        .post('/api/auth/pin-login')
        .set('Cookie', `rpos_dt=${readCookie(device, 'rpos_dt')}`)
        .send({ userId: w.id, pin: '1234' })
    ).body.accessToken;
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function category(name = 'Starters', token = owner) {
    const res = await ctx
      .http()
      .post('/api/menu/categories')
      .set(as(token))
      .send({ name, stationId: station.id })
      .expect(201);
    return res.body.id as string;
  }

  function itemBody(categoryId: string, overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      name: 'Paneer Tikka',
      foodType: 'VEG',
      taxRateId: tax.id,
      variants: [
        { name: 'Half', dineInPrice: 18000 },
        { name: 'Full', dineInPrice: 32000, parcelPrice: 33000, packagingCharge: 1000 },
      ],
      addonGroupIds: [],
      isCombo: false,
      components: [],
      ...overrides,
    };
  }

  async function createItem(body: Record<string, unknown>, token = owner) {
    return ctx.http().post('/api/menu/items').set(as(token)).send(body);
  }

  async function menuItems(): Promise<MenuItem[]> {
    const res = await ctx.http().get('/api/menu').set(as(waiter)).expect(200);
    return (res.body.categories as { items: MenuItem[] }[]).flatMap((c) => c.items);
  }

  it('creates an item with variants and serves it in the menu', async () => {
    const cat = await category();
    expect((await createItem(itemBody(cat))).status).toBe(201);

    const res = await ctx.http().get('/api/menu').set(as(waiter)).expect(200);
    expect(res.body.categories[0]).toMatchObject({
      name: 'Starters',
      station: { id: station.id, name: 'Kitchen' },
    });
    const item = res.body.categories[0].items[0];
    expect(item).toMatchObject({
      name: 'Paneer Tikka',
      foodType: 'VEG',
      isAvailable: true,
      taxRate: { id: tax.id, cgstBp: 250, sgstBp: 250 },
    });
    expect(item.variants).toEqual([
      {
        id: expect.any(String),
        name: 'Half',
        dineInPrice: 18000,
        parcelPrice: 18000,
        packagingCharge: 0,
      },
      {
        id: expect.any(String),
        name: 'Full',
        dineInPrice: 32000,
        parcelPrice: 33000,
        packagingCharge: 1000,
      },
    ]);
  });

  it('archives a removed variant instead of deleting it, and audits price changes', async () => {
    const cat = await category();
    const created = (await createItem(itemBody(cat))).body;
    const full = created.variants.find((v: { name: string }) => v.name === 'Full');
    const half = created.variants.find((v: { name: string }) => v.name === 'Half');

    await ctx
      .http()
      .put(`/api/menu/items/${created.id}`)
      .set(as(owner))
      .send(
        itemBody(cat, {
          variants: [{ id: full.id, name: 'Full', dineInPrice: 34000, parcelPrice: 35000 }],
        }),
      )
      .expect(200);

    const [item] = await menuItems();
    expect(item!.variants.map((v) => [v.id, v.dineInPrice])).toEqual([[full.id, 34000]]);
    const archived = await ctx.prisma.itemVariant.findUniqueOrThrow({ where: { id: half.id } });
    expect(archived.archivedAt).not.toBeNull();

    const audit = await ctx.prisma.auditEntry.findFirst({ where: { action: 'menu.price' } });
    expect(audit?.before).toMatchObject({ Full: { dineInPrice: 32000, parcelPrice: 33000 } });
    expect(audit?.after).toMatchObject({ Full: { dineInPrice: 34000, parcelPrice: 35000 } });
  });

  it('refuses a variant id that belongs to another item', async () => {
    const cat = await category();
    const a = (await createItem(itemBody(cat))).body;
    const b = (await createItem(itemBody(cat, { name: 'Chicken Tikka' }))).body;
    const res = await ctx
      .http()
      .put(`/api/menu/items/${b.id}`)
      .set(as(owner))
      .send(
        itemBody(cat, {
          name: 'Chicken Tikka',
          variants: [{ id: a.variants[0].id, name: 'X', dineInPrice: 1 }],
        }),
      )
      .expect(400);
    expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'variants' });
  });

  it('rejects references to another outlet or to archived rows', async () => {
    const cat = await category();
    const other = await ctx.prisma.outlet.create({ data: { name: 'Other' } });
    const foreignTax = await ctx.prisma.taxRate.create({
      data: { outletId: other.id, name: 'GST 5%', cgstBp: 250, sgstBp: 250 },
    });
    const foreignGroup = await ctx.prisma.addonGroup.create({
      data: { outletId: other.id, name: 'Extras', minSelect: 0, maxSelect: 1 },
    });
    expect((await createItem(itemBody(cat, { taxRateId: foreignTax.id }))).body).toMatchObject({
      code: 'INVALID_REFERENCE',
      field: 'taxRateId',
    });
    expect(
      (await createItem(itemBody(cat, { addonGroupIds: [foreignGroup.id] }))).body,
    ).toMatchObject({ code: 'INVALID_REFERENCE', field: 'addonGroupIds' });

    const old = await category('Old');
    await ctx.http().post(`/api/menu/categories/${old}/archive`).set(as(owner)).expect(201);
    expect((await createItem(itemBody(old))).body).toMatchObject({
      code: 'INVALID_REFERENCE',
      field: 'categoryId',
    });
  });

  it('keeps item names unique within a category', async () => {
    const cat = await category();
    await createItem(itemBody(cat));
    const res = await createItem(itemBody(cat, { name: 'paneer tikka' }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NAME_TAKEN');
  });

  describe('combos', () => {
    it('lists components by name and refuses a combo inside a combo', async () => {
      const cat = await category();
      const tikka = (await createItem(itemBody(cat))).body;
      const combo = await createItem(
        itemBody(cat, {
          name: 'Tikka Meal',
          variants: [{ name: 'Regular', dineInPrice: 40000 }],
          isCombo: true,
          components: [{ variantId: tikka.variants[1].id, quantity: 1 }],
        }),
      );
      expect(combo.status).toBe(201);
      const meal = (await menuItems()).find((i) => i.name === 'Tikka Meal')!;
      expect(meal.components).toEqual([
        {
          variantId: tikka.variants[1].id,
          itemName: 'Paneer Tikka',
          variantName: 'Full',
          quantity: 1,
        },
      ]);

      const nested = await createItem(
        itemBody(cat, {
          name: 'Mega Meal',
          variants: [{ name: 'Regular', dineInPrice: 50000 }],
          isCombo: true,
          components: [{ variantId: combo.body.variants[0].id, quantity: 1 }],
        }),
      );
      expect(nested.status).toBe(400);
      expect(nested.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'components' });
    });

    it('will not turn a combo component into a combo (review #1)', async () => {
      const cat = await category();
      const tikka = (await createItem(itemBody(cat))).body;
      const soup = (
        await createItem(
          itemBody(cat, { name: 'Soup', variants: [{ name: 'Regular', dineInPrice: 9000 }] }),
        )
      ).body;
      await createItem(
        itemBody(cat, {
          name: 'Tikka Meal',
          variants: [{ name: 'Regular', dineInPrice: 40000 }],
          isCombo: true,
          components: [{ variantId: tikka.variants[0].id, quantity: 1 }],
        }),
      );
      const res = await ctx
        .http()
        .put(`/api/menu/items/${tikka.id}`)
        .set(as(owner))
        .send(
          itemBody(cat, {
            variants: tikka.variants.map(
              (v: { id: string; name: string; dineInPrice: number }) => ({
                id: v.id,
                name: v.name,
                dineInPrice: v.dineInPrice,
              }),
            ),
            isCombo: true,
            components: [{ variantId: soup.variants[0].id, quantity: 1 }],
          }),
        )
        .expect(409);
      expect(res.body.code).toBe('IN_USE');
    });

    it('will not remove a size that an active combo uses (review #2)', async () => {
      const cat = await category();
      const tikka = (await createItem(itemBody(cat))).body;
      const half = tikka.variants.find((v: { name: string }) => v.name === 'Half');
      const full = tikka.variants.find((v: { name: string }) => v.name === 'Full');
      await createItem(
        itemBody(cat, {
          name: 'Tikka Meal',
          variants: [{ name: 'Regular', dineInPrice: 40000 }],
          isCombo: true,
          components: [{ variantId: half.id, quantity: 1 }],
        }),
      );
      const res = await ctx
        .http()
        .put(`/api/menu/items/${tikka.id}`)
        .set(as(owner))
        .send(itemBody(cat, { variants: [{ id: full.id, name: 'Full', dineInPrice: 32000 }] }))
        .expect(409);
      expect(res.body.code).toBe('IN_USE');
    });

    it('will not archive an item that an active combo contains', async () => {
      const cat = await category();
      const tikka = (await createItem(itemBody(cat))).body;
      await createItem(
        itemBody(cat, {
          name: 'Tikka Meal',
          variants: [{ name: 'Regular', dineInPrice: 40000 }],
          isCombo: true,
          components: [{ variantId: tikka.variants[0].id, quantity: 2 }],
        }),
      );
      const res = await ctx
        .http()
        .post(`/api/menu/items/${tikka.id}/archive`)
        .set(as(owner))
        .expect(409);
      expect(res.body.code).toBe('IN_USE');
    });
  });

  describe('add-ons', () => {
    it('links an add-on group to an item and hides archived groups', async () => {
      const cat = await category();
      const group = await ctx
        .http()
        .post('/api/menu/addon-groups')
        .set(as(owner))
        .send({
          name: 'Extras',
          minSelect: 0,
          maxSelect: 2,
          addons: [
            { name: 'Extra cheese', price: 3000 },
            { name: 'Less spicy', price: 0 },
          ],
        })
        .expect(201);
      await createItem(itemBody(cat, { addonGroupIds: [group.body.id] }));
      const [item] = await menuItems();
      expect(item!.addonGroups[0]!.addons.map((a) => [a.name, a.price])).toEqual([
        ['Extra cheese', 3000],
        ['Less spicy', 0],
      ]);

      await ctx
        .http()
        .post(`/api/menu/addon-groups/${group.body.id}/archive`)
        .set(as(owner))
        .expect(201);
      const [after] = await menuItems();
      expect(after!.addonGroups).toEqual([]);
    });

    it('lets staff mark an add-on unavailable', async () => {
      const group = await ctx
        .http()
        .post('/api/menu/addon-groups')
        .set(as(owner))
        .send({
          name: 'Extras',
          minSelect: 0,
          maxSelect: 1,
          addons: [{ name: 'Cheese', price: 3000 }],
        });
      const addonId = group.body.addons[0].id;
      await ctx
        .http()
        .patch(`/api/menu/addons/${addonId}/availability`)
        .set(as(waiter))
        .send({ isAvailable: false })
        .expect(200);
      const groups = await ctx.http().get('/api/menu/addon-groups').set(as(owner)).expect(200);
      expect(groups.body[0].addons[0].isAvailable).toBe(false);
    });
  });

  describe('permissions and availability', () => {
    it('lets a waiter mark an item out of stock but not edit the menu', async () => {
      const cat = await category();
      const item = (await createItem(itemBody(cat))).body;
      await ctx
        .http()
        .patch(`/api/menu/items/${item.id}/availability`)
        .set(as(waiter))
        .send({ isAvailable: false })
        .expect(200);
      expect((await menuItems())[0]!.isAvailable).toBe(false);
      expect((await createItem(itemBody(cat, { name: 'Other' }), waiter)).status).toBe(403);
    });

    it('lets a manager edit the menu but not tax rates', async () => {
      const cat = await category('Mains', manager);
      expect((await createItem(itemBody(cat), manager)).status).toBe(201);
      await ctx
        .http()
        .post('/api/tax-rates')
        .set(as(manager))
        .send({ name: 'GST 12%', totalBp: 1200 })
        .expect(403);
    });

    it('will not archive a category that still has items', async () => {
      const cat = await category();
      await createItem(itemBody(cat));
      const res = await ctx
        .http()
        .post(`/api/menu/categories/${cat}/archive`)
        .set(as(owner))
        .expect(409);
      expect(res.body.code).toBe('IN_USE');
    });
  });

  /** Creates a dish and returns its id. */
  async function newItem(body: Record<string, unknown>) {
    const res = await createItem(body);
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

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
    const paneer = await newItem(itemBody(starters, { name: 'Paneer Tikka' }));
    const aloo = await newItem(itemBody(starters, { name: 'Aloo Tikki' }));
    // New dishes go last, so Paneer (first added) comes before Aloo.
    expect(await order()).toEqual([
      ['Starters', ['Paneer Tikka', 'Aloo Tikki']],
      ['Mains', []],
    ]);

    await putOrder('categories/order', [mains, starters], manager).expect(200);
    await putOrder(`categories/${starters}/items/order`, [aloo, paneer], manager).expect(200);
    await newItem(itemBody(starters, { name: 'Chilli Paneer' }));
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
    const paneer = await newItem(itemBody(starters));
    const curry = await newItem(itemBody(mains, { name: 'Dal' }));
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

  const bulk = (body: object, token = owner) =>
    ctx.http().post('/api/menu/prices').set(as(token)).send(body);

  it('changes prices in bulk with rounding and keeps a record', async () => {
    const starters = await category();
    const id = await newItem(itemBody(starters));

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

    await bulk({ itemIds: [id], change: { kind: 'amount', paise: -5000 }, roundTo: 100 }).expect(
      201,
    );
    [item] = await menuItems();
    expect(item!.variants[0]!.dineInPrice).toBe(14000);

    const audit = await ctx.prisma.auditEntry.findFirst({ where: { action: 'menu.price.bulk' } });
    expect(JSON.stringify(audit?.after)).toContain('"before":{"dineIn":18000,"parcel":18000}');
  });

  it('saves nothing when a price would go below ₹0, and refuses others', async () => {
    const starters = await category();
    const id = await newItem(itemBody(starters));
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
});
