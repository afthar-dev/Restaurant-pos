import type { Outlet } from '@prisma/client';
import { parcelOrder, servedOrder } from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('bills', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let r: Restaurant;
  let owner: SignedIn;
  let manager: SignedIn;
  let cashier: SignedIn;
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
    owner = await signIn(ctx, outlet.id, 'OWNER');
    manager = await signIn(ctx, outlet.id, 'MANAGER', 'Meena');
    cashier = await signIn(ctx, outlet.id, 'CASHIER', 'Kavya');
    waiter = await signIn(ctx, outlet.id, 'WAITER', 'Arun');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 100000 })
      .expect(201);
  });

  const createBill = (orderId: string, body: object = {}, who = cashier) =>
    ctx.http().post(`/api/orders/${orderId}/bills`).set(who.auth).send(body);

  const getOrder = async (orderId: string) =>
    (await ctx.http().get(`/api/orders/${orderId}`).set(cashier.auth).expect(200)).body;

  describe('creating', () => {
    it('bills the whole order with 5% GST, numbers it and marks the order billed', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.paneer.half.id, quantity: 2, addonIds: [r.extras.cheese.id] },
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const res = await createBill(orderId).expect(201);
      // (₹180 + ₹30) × 2 + ₹30 = ₹450; tax ₹11.25 + ₹11.25 → ₹472.50 → ₹473
      expect(res.body).toMatchObject({
        billNo: 1,
        status: 'OPEN',
        title: 'Tax Invoice',
        orderType: 'DINE_IN',
        tableName: 'T1',
        subtotal: 45000,
        cgst: 1125,
        sgst: 1125,
        roundOff: 50,
        total: 47300,
        paid: 0,
        due: 47300,
      });
      expect(res.body.financialYear).toMatch(/^\d{4}-\d{2}$/);
      expect(res.body.lines[0]).toMatchObject({
        itemName: 'Paneer Tikka',
        variantName: 'Half',
        addons: [{ name: 'Cheese', price: 3000 }],
        unitPrice: 21000,
        quantity: 2,
        lineTotal: 42000,
      });
      expect(res.body.taxBreakup).toEqual([
        { cgstBp: 250, sgstBp: 250, taxable: 45000, cgst: 1125, sgst: 1125 },
      ]);
      const order = await getOrder(orderId);
      expect(order.status).toBe('BILLED');
      expect(order.bills).toEqual([
        { id: res.body.id, billNo: 1, status: 'OPEN', total: 47300, paid: 0 },
      ]);
      expect(order.items.map((i: { billedQuantity: number }) => i.billedQuantity)).toEqual([2, 1]);
    });

    it('numbers bills one after another across orders', async () => {
      const first = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const second = await servedOrder(
        ctx,
        r,
        waiter,
        [{ variantId: r.roti.regular.id, quantity: 1 }],
        r.t2.id,
      );
      expect((await createBill(first).expect(201)).body.billNo).toBe(1);
      expect((await createBill(second).expect(201)).body.billNo).toBe(2);
    });

    it('splits by items into separate bills and only marks the order billed at the end', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.paneer.half.id, quantity: 2 },
        { variantId: r.roti.regular.id, quantity: 3 },
      ]);
      const order = await getOrder(orderId);
      const paneer = order.items.find((i: { itemName: string }) => i.itemName === 'Paneer Tikka');
      const first = await createBill(orderId, {
        lines: [{ orderItemId: paneer.id, quantity: 1 }],
      }).expect(201);
      expect(first.body.subtotal).toBe(18000);
      let current = await getOrder(orderId);
      expect(current.status).toBe('OPEN');
      expect(current.items.find((i: { id: string }) => i.id === paneer.id).billedQuantity).toBe(1);

      const tooMany = await createBill(orderId, {
        lines: [{ orderItemId: paneer.id, quantity: 2 }],
      }).expect(409);
      expect(tooMany.body.code).toBe('ALREADY_BILLED');

      const rest = await createBill(orderId).expect(201);
      expect(rest.body.subtotal).toBe(18000 + 9000);
      current = await getOrder(orderId);
      expect(current.status).toBe('BILLED');
      const none = await createBill(orderId).expect(409);
      expect(none.body.code).toBe('NOTHING_TO_BILL');
    });

    it('refuses a dish from another order or the same dish twice', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 2 },
      ]);
      const other = await servedOrder(
        ctx,
        r,
        waiter,
        [{ variantId: r.roti.regular.id, quantity: 1 }],
        r.t2.id,
      );
      const foreign = (await getOrder(other)).items[0].id;
      const res = await createBill(orderId, {
        lines: [{ orderItemId: foreign, quantity: 1 }],
      }).expect(400);
      expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'orderItemId' });
      const own = (await getOrder(orderId)).items[0].id;
      await createBill(orderId, {
        lines: [
          { orderItemId: own, quantity: 1 },
          { orderItemId: own, quantity: 1 },
        ],
      }).expect(400);
    });

    it('refuses to bill dishes that were not sent to the kitchen', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      await ctx
        .http()
        .post(`/api/orders/${orderId}/items`)
        .set(waiter.auth)
        .send({ items: [{ variantId: r.roti.regular.id, quantity: 1, addonIds: [] }] })
        .expect(201);
      const res = await createBill(orderId).expect(409);
      expect(res.body.code).toBe('UNSENT_ITEMS');
    });

    it('adds parcel packaging and the bill packaging setting once per order', async () => {
      await ctx.prisma.outlet.update({
        where: { id: outlet.id },
        data: { billPackagingCharge: 1000 },
      });
      const orderId = await parcelOrder(ctx, cashier, [
        { variantId: r.paneer.full.id, quantity: 2 },
      ]);
      const res = await createBill(orderId).expect(201);
      // 2 × ₹330 + 2 × ₹10 + ₹10 = ₹690 taxable; 5% → ₹724.50 → ₹725
      expect(res.body).toMatchObject({
        orderType: 'PARCEL',
        tableName: null,
        subtotal: 66000,
        packaging: 3000,
        taxable: 69000,
        total: 72500,
      });
    });

    it('prints a bill of supply without tax under the composition scheme', async () => {
      await ctx.prisma.outlet.update({
        where: { id: outlet.id },
        data: { taxScheme: 'COMPOSITION' },
      });
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const res = await createBill(orderId).expect(201);
      expect(res.body).toMatchObject({
        title: 'Bill of Supply',
        cgst: 0,
        sgst: 0,
        total: 3000,
        taxBreakup: [],
      });
    });

    it('does not let a waiter print a bill unless the outlet allows it', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      await createBill(orderId, {}, waiter).expect(403);
    });
  });

  describe('reading', () => {
    it('lists the bills of an order and shows one bill', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const bill = (await createBill(orderId).expect(201)).body;
      const list = await ctx
        .http()
        .get(`/api/orders/${orderId}/bills`)
        .set(cashier.auth)
        .expect(200);
      expect(list.body.map((b: { id: string }) => b.id)).toEqual([bill.id]);
      const one = await ctx.http().get(`/api/bills/${bill.id}`).set(manager.auth).expect(200);
      expect(one.body).toMatchObject({ id: bill.id, createdBy: { name: 'Kavya' } });
    });

    it('does not show another outlet its bills', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const bill = (await createBill(orderId).expect(201)).body;
      const elsewhere = await createOutlet(ctx.prisma);
      const stranger = await signIn(ctx, elsewhere.id, 'OWNER');
      await ctx.http().get(`/api/bills/${bill.id}`).set(stranger.auth).expect(404);
    });
  });
});
