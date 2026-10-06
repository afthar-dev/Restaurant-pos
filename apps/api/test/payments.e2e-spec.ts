import type { Outlet } from '@prisma/client';
import { splitEqually } from '@rpos/shared';
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

describe('payments', () => {
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
    manager = await signIn(ctx, outlet.id, 'MANAGER');
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
  const pay = (billId: string, body: object, who = cashier) => payOn(ctx, who, billId, body);
  const orderStatus = async (orderId: string) =>
    (await ctx.http().get(`/api/orders/${orderId}`).set(cashier.auth).expect(200)).body.status;
  const roti = () => [{ variantId: r.roti.regular.id, quantity: 1 }]; // ₹30 + 5% = ₹31.50 → ₹32

  it('takes cash with change, closes the bill and frees the table', async () => {
    const bill = await billFor(roti());
    expect(bill.total).toBe(3200);
    const res = await pay(bill.id, { mode: 'CASH', amount: 3200, tendered: 5000 }).expect(201);
    expect(res.body).toMatchObject({ status: 'PAID', paid: 3200, due: 0 });
    expect(res.body.payments[0]).toMatchObject({
      mode: 'CASH',
      amount: 3200,
      tendered: 5000,
      change: 1800,
    });
    expect(await orderStatus(bill.orderId)).toBe('CLOSED');
    const floor = (await ctx.http().get('/api/floor/status').set(cashier.auth)).body;
    expect(floor[0].tables.find((t: { name: string }) => t.name === 'T1').order).toBeNull();
  });

  it('splits equally into three UPI payments that add up exactly', async () => {
    const bill = await billFor([{ variantId: r.paneer.half.id, quantity: 2 }]); // ₹378
    const parts = splitEqually(bill.total, 3);
    for (const amount of parts.slice(0, 2)) {
      const res = await pay(bill.id, { mode: 'UPI', amount }).expect(201);
      expect(res.body.status).toBe('OPEN');
    }
    const last = await pay(bill.id, { mode: 'UPI', amount: parts[2], reference: 'UTR123' }).expect(
      201,
    );
    expect(last.body).toMatchObject({ status: 'PAID', due: 0, paid: bill.total });
    expect(last.body.payments[2].reference).toBe('UTR123');
  });

  it('refuses more than is due, even from two counters at once', async () => {
    const bill = await billFor(roti());
    const over = await pay(bill.id, { mode: 'CASH', amount: 3300 }).expect(409);
    expect(over.body).toMatchObject({ code: 'OVERPAYMENT', due: 3200 });
    const [a, b] = await Promise.all([
      pay(bill.id, { mode: 'CASH', amount: 3200 }),
      pay(bill.id, { mode: 'UPI', amount: 3200 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await ctx.prisma.payment.count({ where: { billId: bill.id } })).toBe(1);
  });

  it('only takes tendered cash for cash, and not less than the amount', async () => {
    const bill = await billFor(roti());
    await pay(bill.id, { mode: 'UPI', amount: 3200, tendered: 5000 }).expect(400);
    await pay(bill.id, { mode: 'CASH', amount: 3200, tendered: 2000 }).expect(400);
  });

  it('records a payment once when the same request is retried', async () => {
    const bill = await billFor(roti());
    const send = () => pay(bill.id, { mode: 'CASH', amount: 1000 }).set('Idempotency-Key', 'pay-1');
    await send().expect(201);
    const again = await send().expect(201);
    expect(again.body.payments).toHaveLength(1);
    const other = await billFor(roti(), r.t2.id);
    const reused = await pay(other.id, { mode: 'CASH', amount: 1000 })
      .set('Idempotency-Key', 'pay-1')
      .expect(409);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('closes a split order only when every bill is paid', async () => {
    const orderId = await servedOrder(ctx, r, waiter, [
      { variantId: r.roti.regular.id, quantity: 2 },
    ]);
    const order = (await ctx.http().get(`/api/orders/${orderId}`).set(cashier.auth)).body;
    const create = (body: object) =>
      ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth).send(body).expect(201);
    const first = (await create({ lines: [{ orderItemId: order.items[0].id, quantity: 1 }] })).body;
    await pay(first.id, { mode: 'CASH', amount: first.total }).expect(201);
    expect(await orderStatus(orderId)).toBe('OPEN');
    const second = (await create({})).body;
    expect(await orderStatus(orderId)).toBe('BILLED');
    await pay(second.id, { mode: 'CARD', amount: second.total }).expect(201);
    expect(await orderStatus(orderId)).toBe('CLOSED');
  });

  it('settles a free bill straight away', async () => {
    const bill = await billFor(roti());
    const res = await ctx
      .http()
      .put(`/api/bills/${bill.id}/discount`)
      .set(manager.auth)
      .send({ bill: { kind: 'PERCENT', value: 10000 }, reason: 'On the house' })
      .expect(200);
    expect(res.body).toMatchObject({ total: 0, status: 'PAID' });
    expect(await orderStatus(bill.orderId)).toBe('CLOSED');
  });

  it('lets a waiter take payment only when the outlet allows it', async () => {
    const bill = await billFor(roti());
    await pay(bill.id, { mode: 'CASH', amount: 3200 }, waiter).expect(403);
    await ctx.prisma.outlet.update({
      where: { id: outlet.id },
      data: { waiterCanCollectPayment: true },
    });
    const allowed = await signIn(ctx, outlet.id, 'WAITER');
    await pay(bill.id, { mode: 'CASH', amount: 3200 }, allowed).expect(201);
  });
});
