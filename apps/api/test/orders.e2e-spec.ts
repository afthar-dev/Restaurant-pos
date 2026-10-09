import type { Outlet } from '@prisma/client';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('orders', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let r: Restaurant;
  let manager: SignedIn;
  let waiter: SignedIn;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    r = await buildRestaurant(ctx.prisma, outlet.id);
    manager = await signIn(ctx, outlet.id, 'MANAGER');
    waiter = await signIn(ctx, outlet.id, 'WAITER', 'Arun');
  });

  const openDay = () =>
    ctx
      .http()
      .post('/api/business-day/open')
      .set(manager.auth)
      .send({ openingCash: 0 })
      .expect(201);

  const dineIn = (tableId = r.t1.id, auth = waiter.auth) =>
    ctx.http().post('/api/orders').set(auth).send({ type: 'DINE_IN', tableId, guests: 2 });

  const addItems = (orderId: string, items: unknown[], headers: Record<string, string> = {}) =>
    ctx
      .http()
      .post(`/api/orders/${orderId}/items`)
      .set({ ...waiter.auth, ...headers })
      .send({ items });

  describe('opening orders', () => {
    it('refuses orders before the day is open', async () => {
      const res = await dineIn();
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DAY_NOT_OPEN');
    });

    it('opens a dine-in order on a free table and refuses a second one', async () => {
      await openDay();
      const first = await dineIn();
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        type: 'DINE_IN',
        status: 'OPEN',
        table: { id: r.t1.id, name: 'T1' },
        guests: 2,
        waiter: { name: 'Arun' },
        version: 0,
        items: [],
        subtotal: 0,
      });
      const second = await dineIn();
      expect(second.status).toBe(409);
      expect(second.body).toMatchObject({ code: 'TABLE_BUSY', orderId: first.body.id });
    });

    it('opens exactly one order when two waiters take the same table at once', async () => {
      await openDay();
      const results = await Promise.all([dineIn(), dineIn(), dineIn()]);
      expect(results.filter((x) => x.status === 201)).toHaveLength(1);
      expect(await ctx.prisma.order.count({ where: { tableId: r.t1.id } })).toBe(1);
    });

    it('numbers parcel orders 1, 2, 3 within the day', async () => {
      await openDay();
      const tokens: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const res = await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'PARCEL' });
        tokens.push(res.body.tokenNo);
      }
      expect(tokens).toEqual([1, 2, 3]);
    });

    it('marks orders from a waiter phone as captain orders', async () => {
      await openDay();
      const res = await dineIn();
      expect(res.body.source).toBe('CAPTAIN');
    });
  });

  describe('adding items', () => {
    it('adds a repeated plain dish to its unsent line instead of a second line', async () => {
      await openDay();
      const order = (await dineIn()).body;
      const roti = { variantId: r.roti.regular.id, quantity: 1, addonIds: [] };
      await addItems(order.id, [roti]).expect(201);
      const twice = await addItems(order.id, [roti, roti]).expect(201);
      expect(twice.body.items).toHaveLength(1);
      expect(twice.body.items[0]).toMatchObject({ itemName: 'Tandoori Roti', quantity: 3 });

      // A note or an add-on makes it a different dish for the kitchen.
      const noted = await addItems(order.id, [{ ...roti, note: 'well done' }]).expect(201);
      expect(noted.body.items).toHaveLength(2);

      // Once the kitchen has it, more of the same is a new line on a new ticket.
      await ctx.http().post(`/api/orders/${order.id}/kot`).set(waiter.auth).expect(201);
      const after = await addItems(order.id, [roti]).expect(201);
      expect(after.body.items).toHaveLength(3);
      expect(after.body.items.filter((i: { status: string }) => i.status === 'NEW')).toHaveLength(
        1,
      );
    });

    it('snapshots dine-in prices, add-ons and the kitchen station', async () => {
      await openDay();
      const order = (await dineIn()).body;
      const res = await addItems(order.id, [
        {
          variantId: r.paneer.full.id,
          quantity: 2,
          addonIds: [r.extras.cheese.id],
          note: 'less spicy',
        },
        { variantId: r.roti.regular.id, quantity: 3, addonIds: [] },
      ]);
      expect(res.status).toBe(201);
      expect(res.body.version).toBe(1);
      const [tikka, roti] = res.body.items;
      expect(tikka).toMatchObject({
        itemName: 'Paneer Tikka',
        variantName: 'Full',
        unitPrice: 32000,
        packagingCharge: 0,
        quantity: 2,
        addons: [{ id: r.extras.cheese.id, name: 'Cheese', price: 3000 }],
        note: 'less spicy',
        status: 'NEW',
        cgstBp: 250,
        sgstBp: 250,
        lineTotal: 70000,
      });
      expect(roti).toMatchObject({ unitPrice: 3000, lineTotal: 9000 });
      expect(res.body.subtotal).toBe(79000);
      const stored = await ctx.prisma.orderItem.findFirstOrThrow({
        where: { itemName: 'Tandoori Roti' },
      });
      expect(stored.stationId).toBe(r.tandoor.id);
    });

    it('uses parcel prices and packaging for parcel orders', async () => {
      await openDay();
      const order = (await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'PARCEL' }))
        .body;
      const res = await addItems(order.id, [
        { variantId: r.paneer.full.id, quantity: 1, addonIds: [] },
      ]);
      expect(res.body.items[0]).toMatchObject({ unitPrice: 33000, packagingCharge: 1000 });
    });

    it('keeps the ordered price when the menu price changes later', async () => {
      await openDay();
      const order = (await dineIn()).body;
      await addItems(order.id, [{ variantId: r.paneer.half.id, quantity: 1, addonIds: [] }]);
      await ctx.prisma.itemVariant.update({
        where: { id: r.paneer.half.id },
        data: { dineInPrice: 99900, name: 'Small' },
      });
      await ctx.prisma.taxRate.update({
        where: { id: r.gst5.id },
        data: { cgstBp: 900, sgstBp: 900 },
      });
      const res = await ctx.http().get(`/api/orders/${order.id}`).set(waiter.auth).expect(200);
      expect(res.body.items[0]).toMatchObject({
        variantName: 'Half',
        unitPrice: 18000,
        cgstBp: 250,
      });
    });

    it('snapshots combo contents for the kitchen', async () => {
      await openDay();
      const order = (await dineIn()).body;
      await addItems(order.id, [{ variantId: r.meal.regular.id, quantity: 1, addonIds: [] }]);
      const stored = await ctx.prisma.orderItem.findFirstOrThrow({
        where: { itemName: 'Tikka Meal' },
      });
      expect(stored.comboComponents).toEqual([
        { itemName: 'Paneer Tikka', variantName: 'Half', quantity: 1 },
        { itemName: 'Tandoori Roti', variantName: 'Regular', quantity: 2 },
      ]);
    });

    it('refuses an out-of-stock item', async () => {
      await openDay();
      const order = (await dineIn()).body;
      const res = await addItems(order.id, [
        { variantId: r.soup.regular.id, quantity: 1, addonIds: [] },
      ]);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'ITEM_UNAVAILABLE', itemId: r.soup.item.id });
    });

    it('refuses add-ons that do not belong to the item, are out of stock or break the group rules', async () => {
      await openDay();
      const order = (await dineIn()).body;
      const wrongGroup = await addItems(order.id, [
        { variantId: r.paneer.half.id, quantity: 1, addonIds: [r.chutney.coconut.id] },
      ]);
      expect(wrongGroup.status).toBe(400);
      expect(wrongGroup.body.code).toBe('ADDONS_INVALID');

      const outOfStock = await addItems(order.id, [
        { variantId: r.paneer.half.id, quantity: 1, addonIds: [r.extras.butter.id] },
      ]);
      expect(outOfStock.body.code).toBe('ADDONS_INVALID');

      const missingRequired = await addItems(order.id, [
        { variantId: r.dosa.regular.id, quantity: 1, addonIds: [] },
      ]);
      expect(missingRequired.body.code).toBe('ADDONS_INVALID');

      const tooMany = await addItems(order.id, [
        {
          variantId: r.dosa.regular.id,
          quantity: 1,
          addonIds: [r.chutney.coconut.id, r.chutney.tomato.id],
        },
      ]);
      expect(tooMany.body.code).toBe('ADDONS_INVALID');
    });

    it('rejects a stale version with ORDER_CHANGED', async () => {
      await openDay();
      const order = (await dineIn()).body;
      await addItems(order.id, [{ variantId: r.roti.regular.id, quantity: 1, addonIds: [] }], {
        'If-Match': '0',
      });
      const stale = await addItems(
        order.id,
        [{ variantId: r.roti.regular.id, quantity: 1, addonIds: [] }],
        { 'If-Match': '0' },
      );
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('ORDER_CHANGED');
    });
  });

  describe('editing unsent items', () => {
    it('changes quantity and removes a NEW item', async () => {
      await openDay();
      const order = (await dineIn()).body;
      const added = await addItems(order.id, [
        { variantId: r.roti.regular.id, quantity: 1, addonIds: [] },
      ]);
      const itemId = added.body.items[0].id;
      const updated = await ctx
        .http()
        .patch(`/api/orders/${order.id}/items/${itemId}`)
        .set(waiter.auth)
        .send({ quantity: 4 })
        .expect(200);
      expect(updated.body.items[0].quantity).toBe(4);
      const removed = await ctx
        .http()
        .delete(`/api/orders/${order.id}/items/${itemId}`)
        .set(waiter.auth)
        .expect(200);
      expect(removed.body.items).toEqual([]);
    });

    it('cancels an order that has nothing in the kitchen yet', async () => {
      await openDay();
      const order = (await dineIn()).body;
      const res = await ctx
        .http()
        .post(`/api/orders/${order.id}/cancel`)
        .set(waiter.auth)
        .send({ reason: 'Wrong table' })
        .expect(201);
      expect(res.body.status).toBe('CANCELLED');
      expect((await dineIn()).status).toBe(201);
    });
  });

  describe('reading', () => {
    it('shows running tables on the floor and lists active orders', async () => {
      await openDay();
      const order = (await dineIn()).body;
      await addItems(order.id, [{ variantId: r.roti.regular.id, quantity: 2, addonIds: [] }]);
      const floor = await ctx.http().get('/api/floor/status').set(waiter.auth).expect(200);
      const tables = floor.body[0].tables;
      expect(tables.find((t: { name: string }) => t.name === 'T1').order).toMatchObject({
        orderId: order.id,
        status: 'OPEN',
        guests: 2,
        itemCount: 2,
        subtotal: 6000,
      });
      expect(tables.find((t: { name: string }) => t.name === 'T2').order).toBeNull();

      const active = await ctx.http().get('/api/orders?status=active').set(waiter.auth).expect(200);
      expect(active.body).toEqual([
        expect.objectContaining({ id: order.id, tableName: 'T1', subtotal: 6000 }),
      ]);
    });

    it('includes the station and time of each item and refuses unknown list filters', async () => {
      await openDay();
      const order = (await dineIn()).body;
      const res = await addItems(order.id, [
        { variantId: r.roti.regular.id, quantity: 1, addonIds: [] },
      ]);
      expect(res.body.items[0]).toMatchObject({
        stationId: r.tandoor.id,
        createdAt: expect.any(String),
      });
      await ctx.http().get('/api/orders?status=closed').set(waiter.auth).expect(400);
    });

    it('does not show another outlet its orders', async () => {
      await openDay();
      const order = (await dineIn()).body;
      const other = await ctx.prisma.outlet.create({ data: { name: 'Other' } });
      const stranger = await signIn(ctx, other.id, 'MANAGER');
      await ctx.http().get(`/api/orders/${order.id}`).set(stranger.auth).expect(404);
    });
  });
});
