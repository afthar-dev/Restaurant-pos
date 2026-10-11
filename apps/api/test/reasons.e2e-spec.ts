import type { Outlet } from '@prisma/client';
import { overrideToken, parcelOrder, servedOrder } from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

/** The Asia/Kolkata calendar date `daysAgo` days before now, as YYYY-MM-DD. */
function istDate(daysAgo = 0): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000 - daysAgo * 86_400_000);
  return ist.toISOString().slice(0, 10);
}

describe('reason codes and the accountability report', () => {
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

  /** 2 × Paneer Half (₹360) + 1 × Roti (₹30) as a parcel, billed: gross ₹390 plus packaging. */
  async function bill390() {
    const orderId = await parcelOrder(ctx, waiter, [
      { variantId: r.paneer.half.id, quantity: 2 },
      { variantId: r.roti.regular.id, quantity: 1 },
    ]);
    const res = await ctx
      .http()
      .post(`/api/orders/${orderId}/bills`)
      .set(cashier.auth)
      .send({})
      .expect(201);
    return res.body as { id: string; orderId: string };
  }

  const discount = (billId: string, body: object, who = cashier) =>
    ctx.http().put(`/api/bills/${billId}/discount`).set(who.auth).send(body);
  const voidBill = (billId: string, body: object, who = manager) =>
    ctx.http().post(`/api/bills/${billId}/void`).set(who.auth).send(body);

  describe('discount', () => {
    it('stores and audits a valid code, filling the free text with the label', async () => {
      const bill = await bill390();
      const res = await discount(bill.id, {
        bill: { kind: 'FLAT', value: 500 },
        reasonCode: 'COMPLIMENTARY',
      }).expect(200);
      expect(res.body.discountReason).toBe('Complimentary');
      const row = await ctx.prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
      expect(row).toMatchObject({
        discountReason: 'Complimentary',
        discountReasonCode: 'COMPLIMENTARY',
      });
      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'bill.discount' },
      });
      expect(audit).toMatchObject({ reason: 'Complimentary', actorId: cashier.user.id });
      expect(audit.after).toMatchObject({ reasonCode: 'COMPLIMENTARY' });
    });

    it('keeps the note for OTHER, and refuses OTHER without one', async () => {
      const bill = await bill390();
      await discount(bill.id, { bill: { kind: 'FLAT', value: 500 }, reasonCode: 'OTHER' }).expect(
        400,
      );
      await discount(bill.id, {
        bill: { kind: 'FLAT', value: 500 },
        reasonCode: 'OTHER',
        note: 'Hair in the food',
      }).expect(200);
      expect(await ctx.prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).toMatchObject({
        discountReason: 'Hair in the food',
        discountReasonCode: 'OTHER',
      });
    });

    it('still takes the older free-text reason, stored as OTHER', async () => {
      const bill = await bill390();
      await discount(bill.id, {
        bill: { kind: 'FLAT', value: 500 },
        reason: 'Regular guest',
      }).expect(200);
      expect(await ctx.prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).toMatchObject({
        discountReason: 'Regular guest',
        discountReasonCode: 'OTHER',
      });
    });

    it('needs a reason while a discount is on, and rejects an unknown code', async () => {
      const bill = await bill390();
      await discount(bill.id, { bill: { kind: 'FLAT', value: 500 } }).expect(400);
      await discount(bill.id, {
        bill: { kind: 'FLAT', value: 500 },
        reasonCode: 'NOPE',
      }).expect(400);
    });

    it('takes a short note on a named reason, but not a short legacy text', async () => {
      const bill = await bill390();
      await discount(bill.id, {
        bill: { kind: 'FLAT', value: 500 },
        reasonCode: 'REGULAR',
        note: 'ok',
      }).expect(200);
      await discount(bill.id, { bill: { kind: 'FLAT', value: 500 }, reason: 'ab' }).expect(400);
    });

    it('still asks a manager above the cashier cap', async () => {
      const bill = await bill390();
      await discount(bill.id, {
        bill: { kind: 'FLAT', value: 20000 },
        reasonCode: 'MANAGER_OFFER',
      }).expect(403);
      const token = await overrideToken(ctx, manager, cashier, 'discount.unlimited');
      await ctx
        .http()
        .put(`/api/bills/${bill.id}/discount`)
        .set({ ...cashier.auth, 'x-override-token': token })
        .send({ bill: { kind: 'FLAT', value: 20000 }, reasonCode: 'MANAGER_OFFER' })
        .expect(200);
    });
  });

  describe('void', () => {
    it('stores and audits a valid code', async () => {
      const bill = await bill390();
      const res = await voidBill(bill.id, { reasonCode: 'DUPLICATE' }).expect(201);
      expect(res.body.voidReason).toBe('Duplicate bill');
      expect(await ctx.prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).toMatchObject({
        voidReason: 'Duplicate bill',
        voidReasonCode: 'DUPLICATE',
      });
      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'bill.void' },
      });
      expect(audit).toMatchObject({ reason: 'Duplicate bill', actorId: manager.user.id });
      expect(audit.after).toMatchObject({ reasonCode: 'DUPLICATE' });
    });

    it('refuses OTHER without a note, an unknown code and no reason at all', async () => {
      const bill = await bill390();
      await voidBill(bill.id, { reasonCode: 'OTHER' }).expect(400);
      await voidBill(bill.id, { reasonCode: 'NOPE' }).expect(400);
      await voidBill(bill.id, {}).expect(400);
    });

    it('still takes the older free-text reason, stored as OTHER', async () => {
      const bill = await bill390();
      await voidBill(bill.id, { reason: 'Wrong table' }).expect(201);
      expect(await ctx.prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).toMatchObject({
        voidReason: 'Wrong table',
        voidReasonCode: 'OTHER',
      });
    });
  });

  describe('cancel', () => {
    async function sentOrder() {
      const orderId = await parcelOrder(ctx, waiter, [
        { variantId: r.paneer.half.id, quantity: 2 },
      ]);
      const order = (await ctx.http().get(`/api/orders/${orderId}`).set(manager.auth).expect(200))
        .body;
      return { orderId, itemId: order.items[0].id as string, version: order.version as number };
    }
    const cancelItem = (orderId: string, itemId: string, body: object) =>
      ctx.http().post(`/api/orders/${orderId}/items/${itemId}/cancel`).set(manager.auth).send(body);

    it('stores and audits a dish cancel code', async () => {
      const { orderId, itemId } = await sentOrder();
      await cancelItem(orderId, itemId, { reasonCode: 'OUT_OF_STOCK', quantity: 1 }).expect(201);
      const cancelled = await ctx.prisma.orderItem.findFirstOrThrow({
        where: { orderId, status: 'CANCELLED' },
      });
      expect(cancelled).toMatchObject({
        cancelReason: 'Out of stock',
        cancelReasonCode: 'OUT_OF_STOCK',
        quantity: 1,
      });
      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'order.item.cancel' },
      });
      expect(audit).toMatchObject({ reason: 'Out of stock' });
      expect(audit.after).toMatchObject({ reasonCode: 'OUT_OF_STOCK' });
    });

    it('refuses OTHER without a note, and takes the older free text as OTHER', async () => {
      const { orderId, itemId } = await sentOrder();
      await cancelItem(orderId, itemId, { reasonCode: 'OTHER' }).expect(400);
      await cancelItem(orderId, itemId, { reason: 'Customer changed mind', quantity: 1 }).expect(
        201,
      );
      expect(
        await ctx.prisma.orderItem.findFirstOrThrow({ where: { orderId, status: 'CANCELLED' } }),
      ).toMatchObject({ cancelReason: 'Customer changed mind', cancelReasonCode: 'OTHER' });
    });

    it('stores a code when a whole order is voided or cancelled', async () => {
      const { orderId } = await sentOrder();
      await ctx
        .http()
        .post(`/api/orders/${orderId}/void`)
        .set(manager.auth)
        .send({ reasonCode: 'WRONG_DISH' })
        .expect(201);
      expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
        cancelReason: 'Wrong dish',
        cancelReasonCode: 'WRONG_DISH',
      });
      const fresh = (
        await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'PARCEL' }).expect(201)
      ).body;
      await ctx
        .http()
        .post(`/api/orders/${fresh.id}/cancel`)
        .set(waiter.auth)
        .send({ reasonCode: 'LONG_WAIT' })
        .expect(201);
      expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: fresh.id } })).toMatchObject({
        cancelReasonCode: 'LONG_WAIT',
      });
    });
  });

  describe('accountability report', () => {
    const report = (from: string, to: string, who = owner) =>
      ctx.http().get(`/api/reports/accountability?from=${from}&to=${to}`).set(who.auth);

    it('totals discounts, voids, cancels and reprints by reason and by staff', async () => {
      // Kavya (cashier) gives a complimentary discount of ₹5; Meena (manager) gives a
      // complimentary one of ₹10 and a regular-customer one of ₹20.
      const b1 = await bill390();
      await discount(b1.id, {
        bill: { kind: 'FLAT', value: 500 },
        reasonCode: 'COMPLIMENTARY',
      }).expect(200);
      const b2 = await bill390();
      await discount(
        b2.id,
        { bill: { kind: 'FLAT', value: 1000 }, reasonCode: 'COMPLIMENTARY' },
        manager,
      ).expect(200);
      const b3 = await bill390();
      await discount(
        b3.id,
        { bill: { kind: 'FLAT', value: 2000 }, reasonCode: 'REGULAR' },
        manager,
      ).expect(200);
      // A discounted bill that is then voided no longer counts as a discount.
      const b4 = await bill390();
      await discount(
        b4.id,
        { bill: { kind: 'FLAT', value: 700 }, reasonCode: 'STAFF_MEAL' },
        manager,
      ).expect(200);
      await voidBill(b4.id, { reasonCode: 'WRONG_ORDER' }).expect(201);
      // Meena voids another bill for a duplicate, and cancels one of two paneer.
      const b5 = await bill390();
      await voidBill(b5.id, { reasonCode: 'DUPLICATE' }).expect(201);
      const orderId = await parcelOrder(ctx, waiter, [
        { variantId: r.paneer.half.id, quantity: 2 },
      ]);
      const item = (await ctx.http().get(`/api/orders/${orderId}`).set(manager.auth).expect(200))
        .body.items[0];
      await ctx
        .http()
        .post(`/api/orders/${orderId}/items/${item.id}/cancel`)
        .set(manager.auth)
        .send({ reasonCode: 'CHANGED_MIND', quantity: 1 })
        .expect(201);
      // Kavya reprints a bill twice.
      await ctx.http().post(`/api/bills/${b1.id}/print`).set(cashier.auth).expect(201);
      await ctx.http().post(`/api/bills/${b1.id}/print`).set(cashier.auth).expect(201);

      const res = await report(istDate(), istDate()).expect(200);
      const byReason = (kind: string, code: string) =>
        (res.body.byReason as { kind: string; code: string; count: number; amount: number }[]).find(
          (x) => x.kind === kind && x.code === code,
        );
      expect(byReason('discount', 'COMPLIMENTARY')).toMatchObject({ count: 2, amount: 1500 });
      expect(byReason('discount', 'REGULAR')).toMatchObject({ count: 1, amount: 2000 });
      expect(byReason('discount', 'STAFF_MEAL')).toBeUndefined();
      expect(byReason('void', 'WRONG_ORDER')).toMatchObject({ count: 1 });
      expect(byReason('void', 'DUPLICATE')).toMatchObject({ count: 1 });
      expect(byReason('cancel', 'CHANGED_MIND')).toMatchObject({ count: 1, amount: 18000 });

      const staff = (id: string) =>
        (res.body.byStaff as { userId: string; name: string }[]).find((s) => s.userId === id);
      expect(staff(cashier.user.id)).toMatchObject({
        name: 'Kavya',
        discounts: { count: 1, amount: 500 },
        voids: { count: 0, amount: 0 },
        cancels: { count: 0, amount: 0 },
        reprints: 2,
        cashOut: { count: 0, amount: 0 },
        modeChanges: 0,
      });
      expect(staff(manager.user.id)).toMatchObject({
        name: 'Meena',
        discounts: { count: 2, amount: 3000 },
        voids: { count: 2 },
        cancels: { count: 1, amount: 18000 },
        reprints: 0,
      });
      expect(staff(waiter.user.id)).toBeUndefined();
    });

    it('counts only the days asked for (India dates), and needs reports.all', async () => {
      const b1 = await bill390();
      await discount(b1.id, {
        bill: { kind: 'FLAT', value: 500 },
        reasonCode: 'COMPLIMENTARY',
      }).expect(200);
      const empty = await report(istDate(10), istDate(5)).expect(200);
      expect(empty.body).toEqual({ byReason: [], byStaff: [] });
      await report(istDate(), istDate(), cashier).expect(403);
      await ctx
        .http()
        .get('/api/reports/accountability?from=nope&to=nope')
        .set(owner.auth)
        .expect(400);
    });

    it('keeps a cancelled dish on its own IST date after its table is merged', async () => {
      const from = await servedOrder(
        ctx,
        r,
        waiter,
        [{ variantId: r.paneer.half.id, quantity: 2 }],
        r.t2.id,
      );
      const into = await servedOrder(
        ctx,
        r,
        waiter,
        [{ variantId: r.roti.regular.id, quantity: 1 }],
        r.t1.id,
      );
      const item = (await ctx.http().get(`/api/orders/${from}`).set(manager.auth).expect(200)).body
        .items[0];
      await ctx
        .http()
        .post(`/api/orders/${from}/items/${item.id}/cancel`)
        .set(manager.auth)
        .send({ reasonCode: 'WRONG_DISH', quantity: 1 })
        .expect(201);
      // Pretend it was cancelled at 23:50 IST yesterday, then merge the table (touches updatedAt).
      const yesterday = istDate(1);
      await ctx.prisma.orderItem.updateMany({
        where: { orderId: from, status: 'CANCELLED' },
        data: { cancelledAt: new Date(`${yesterday}T23:50:00+05:30`) },
      });
      await ctx
        .http()
        .post(`/api/orders/${into}/merge`)
        .set(waiter.auth)
        .send({ fromOrderId: from })
        .expect(201);
      const onYesterday = await report(yesterday, yesterday).expect(200);
      expect(onYesterday.body.byReason).toEqual([
        { kind: 'cancel', code: 'WRONG_DISH', count: 1, amount: 18000 },
      ]);
      const today = await report(istDate(), istDate()).expect(200);
      expect(today.body.byReason).toEqual([]);
    });

    it('reports a discount from before reason codes as Other', async () => {
      const b1 = await bill390();
      await discount(b1.id, { bill: { kind: 'FLAT', value: 500 }, reasonCode: 'REGULAR' }).expect(
        200,
      );
      await ctx.prisma.bill.update({
        where: { id: b1.id },
        data: { discountReasonCode: null, discountReason: 'Old note' },
      });
      const res = await report(istDate(), istDate()).expect(200);
      expect(res.body.byReason).toEqual([
        { kind: 'discount', code: 'OTHER', count: 1, amount: 500 },
      ]);
    });
  });
});
