import type { Outlet } from '@prisma/client';
import { billFor as billForOn, pay as payOn, servedOrder, type Line } from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('closing the business day', () => {
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
    cashier = await signIn(ctx, outlet.id, 'CASHIER');
    waiter = await signIn(ctx, outlet.id, 'WAITER');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 100000 })
      .expect(201);
  });

  const billFor = (lines: Line[], tableId = r.t1.id) =>
    billForOn(ctx, r, waiter, cashier, lines, tableId);
  const pay = (billId: string, body: object) => payOn(ctx, cashier, billId, body);
  const close = (body: object, who = manager) =>
    ctx.http().post('/api/business-day/close').set(who.auth).send(body);
  const roti = () => [{ variantId: r.roti.regular.id, quantity: 1 }];

  it('lists what blocks the close', async () => {
    const open = await servedOrder(ctx, r, waiter, roti());
    const unpaid = await billFor(roti(), r.t2.id);
    const check = await ctx
      .http()
      .get('/api/business-day/close-check')
      .set(manager.auth)
      .expect(200);
    expect(check.body.blockers.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: open, label: 'T1', status: 'OPEN' }),
        expect.objectContaining({ id: unpaid.orderId, label: 'T2', status: 'BILLED' }),
      ]),
    );
    expect(check.body.blockers.bills).toEqual([
      { id: unpaid.id, orderId: unpaid.orderId, billNo: unpaid.billNo, due: unpaid.total },
    ]);
    expect(check.body.cash).toEqual({
      opening: 100000,
      cashSales: 0,
      cashExpenses: 0,
      expected: 100000,
    });
    const res = await close({ countedCash: 0 }).expect(409);
    expect(res.body.code).toBe('DAY_HAS_OPEN_WORK');
    expect(res.body.blockers.bills).toHaveLength(1);
  });

  it('closes with the cash tally and the day report, then blocks new orders', async () => {
    const cash = await billFor(roti(), r.t1.id); // ₹32
    await pay(cash.id, { mode: 'CASH', amount: cash.total }).expect(201);
    const upi = await billFor([{ variantId: r.paneer.half.id, quantity: 2 }], r.t2.id); // ₹378
    await pay(upi.id, { mode: 'UPI', amount: upi.total }).expect(201);

    const res = await close({ countedCash: 103000, note: 'Short ₹2' }).expect(201);
    expect(res.body.cash).toEqual({
      opening: 100000,
      cashSales: 3200,
      cashExpenses: 0,
      expected: 103200,
      counted: 103000,
      variance: -200,
    });
    expect(res.body.payments).toEqual({ CASH: 3200, UPI: 37800, CARD: 0 });
    expect(res.body.sales).toMatchObject({ bills: 2, total: 41000, cgst: 975, sgst: 975 });
    expect(res.body.byType).toEqual({
      DINE_IN: { orders: 2, total: 41000 },
      PARCEL: { orders: 0, total: 0 },
    });
    expect(res.body.topItems[0]).toMatchObject({ itemName: 'Paneer Tikka', quantity: 2 });
    expect(res.body.day).toMatchObject({
      status: 'CLOSED',
      closedBy: { name: 'Meena' },
      closeNote: 'Short ₹2',
    });

    const order = await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'PARCEL' });
    expect(order.status).toBe(409);
    expect(order.body.code).toBe('DAY_NOT_OPEN');
    expect(await ctx.prisma.auditEntry.count({ where: { action: 'day.close' } })).toBe(1);
  });

  it('counts a void bill only as a void, with discounts and cancels listed', async () => {
    const bill = await billFor(roti());
    await ctx
      .http()
      .post(`/api/bills/${bill.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Wrong table' })
      .expect(201);
    const again = (
      await ctx
        .http()
        .post(`/api/orders/${bill.orderId}/bills`)
        .set(cashier.auth)
        .send({})
        .expect(201)
    ).body;
    const discounted = (
      await ctx
        .http()
        .put(`/api/bills/${again.id}/discount`)
        .set(cashier.auth)
        .send({ bill: { kind: 'FLAT', value: 200 }, reason: 'Regular' })
        .expect(200)
    ).body;
    await pay(again.id, { mode: 'CARD', amount: discounted.total }).expect(201);

    const res = await close({ countedCash: 100000 }).expect(201);
    expect(res.body.sales.bills).toBe(1);
    expect(res.body.voids).toEqual([
      { billNo: bill.billNo, total: bill.total, reason: 'Wrong table', by: 'Meena' },
    ]);
    expect(res.body.discounts).toEqual([{ billNo: again.billNo, amount: 200, reason: 'Regular' }]);
    expect(res.body.payments).toEqual({ CASH: 0, UPI: 0, CARD: discounted.total });
  });

  it('never leaves an order on a closed day when close and a new order race', async () => {
    const [order, closed] = await Promise.all([
      ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'PARCEL' }),
      close({ countedCash: 100000 }),
    ]);
    if (closed.status === 201) {
      expect(order.status).toBe(409);
    } else {
      expect(order.status).toBe(201);
      expect(closed.body.code).toBe('DAY_HAS_OPEN_WORK');
    }
    const onClosedDays = await ctx.prisma.order.count({
      where: { businessDay: { status: 'CLOSED' } },
    });
    expect(onClosedDays).toBe(0);
  });

  it('lets only the owner reopen the last day, with a reason', async () => {
    await close({ countedCash: 100000 }).expect(201);
    const days = await ctx.http().get('/api/business-day?limit=1').set(manager.auth).expect(200);
    const day = days.body[0];
    expect(day).toMatchObject({ status: 'CLOSED', expectedCash: 100000, countedCash: 100000 });
    const reopen = (who: SignedIn) =>
      ctx
        .http()
        .post(`/api/business-day/${day.id}/reopen`)
        .set(who.auth)
        .send({ reason: 'Missed a bill' });
    await reopen(manager).expect(403);
    const res = await reopen(owner).expect(201);
    expect(res.body.status).toBe('OPEN');
    expect(
      await ctx.prisma.auditEntry.count({
        where: { action: 'day.reopen', reason: 'Missed a bill' },
      }),
    ).toBe(1);
    await ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'PARCEL' }).expect(201);
    const twice = await reopen(owner).expect(409);
    expect(twice.body.code).toBe('DAY_NOT_CLOSED');
  });

  it('reads the report of any past day', async () => {
    await close({ countedCash: 99000 }).expect(201);
    const [day] = (await ctx.http().get('/api/business-day').set(manager.auth).expect(200)).body;
    const report = await ctx
      .http()
      .get(`/api/business-day/${day.id}/report`)
      .set(manager.auth)
      .expect(200);
    expect(report.body.cash).toMatchObject({ counted: 99000, variance: -1000 });
    const elsewhere = await createOutlet(ctx.prisma);
    const stranger = await signIn(ctx, elsewhere.id, 'OWNER');
    await ctx.http().get(`/api/business-day/${day.id}/report`).set(stranger.auth).expect(404);
  });

  it('does not let a cashier close the day or read reports', async () => {
    await ctx.http().get('/api/business-day/close-check').set(cashier.auth).expect(403);
    await close({ countedCash: 0 }, cashier).expect(403);
    await ctx.http().get('/api/business-day').set(cashier.auth).expect(403);
  });
});
