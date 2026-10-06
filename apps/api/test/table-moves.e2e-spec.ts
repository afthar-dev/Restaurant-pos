import type { Outlet } from '@prisma/client';
import { parcelOrder, servedOrder } from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createDevice,
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('moving and merging tables', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let r: Restaurant;
  let owner: SignedIn;
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
    cashier = await signIn(ctx, outlet.id, 'CASHIER');
    waiter = await signIn(ctx, outlet.id, 'WAITER');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 0 })
      .expect(201);
  });

  const roti = () => [{ variantId: r.roti.regular.id, quantity: 1 }];
  const move = (orderId: string, tableId: string) =>
    ctx.http().post(`/api/orders/${orderId}/move`).set(waiter.auth).send({ tableId });
  const merge = (intoId: string, fromOrderId: string) =>
    ctx.http().post(`/api/orders/${intoId}/merge`).set(waiter.auth).send({ fromOrderId });
  const seat = (tableId: string) =>
    ctx.http().post('/api/orders').set(waiter.auth).send({ type: 'DINE_IN', tableId, guests: 2 });

  it('moves a running order to a free table, and the kitchen sees the new table', async () => {
    const kds = await createDevice(ctx.prisma, outlet.id, owner.user.id, 'KDS', 'Kitchen screen');
    const orderId = await servedOrder(ctx, r, waiter, roti());
    const res = await move(orderId, r.t2.id).expect(201);
    expect(res.body.table).toEqual({ id: r.t2.id, name: 'T2' });
    const tickets = await ctx
      .http()
      .get('/api/kds/kots')
      .set('Cookie', `rpos_dt=${kds.cookie}`)
      .expect(200);
    expect(tickets.body[0].tableName).toBe('T2');
    await seat(r.t1.id).expect(201);
  });

  it('will not move onto a busy table or the same table', async () => {
    const a = await servedOrder(ctx, r, waiter, roti(), r.t1.id);
    await servedOrder(ctx, r, waiter, roti(), r.t2.id);
    const busy = await move(a, r.t2.id).expect(409);
    expect(busy.body.code).toBe('TABLE_BUSY');
    await move(a, r.t1.id).expect(400);
  });

  it('does not move a parcel onto a table', async () => {
    const orderId = await parcelOrder(ctx, cashier, roti());
    const res = await move(orderId, r.t2.id).expect(409);
    expect(res.body.code).toBe('NOT_DINE_IN');
  });

  it('merges one table into another and holds both tables until the bill is paid', async () => {
    const a = await servedOrder(ctx, r, waiter, roti(), r.t1.id);
    const b = await servedOrder(
      ctx,
      r,
      waiter,
      [{ variantId: r.paneer.half.id, quantity: 1 }],
      r.t2.id,
    );
    const res = await merge(a, b).expect(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.kots).toHaveLength(2);
    expect(res.body.guests).toBe(4);
    expect(res.body.mergedTables).toEqual([{ id: r.t2.id, name: 'T2' }]);

    const old = (await ctx.http().get(`/api/orders/${b}`).set(waiter.auth).expect(200)).body;
    expect(old).toMatchObject({ status: 'CANCELLED', cancelReason: 'Merged into T1' });
    await seat(r.t2.id).expect(409);

    const floor = (await ctx.http().get('/api/floor/status').set(waiter.auth).expect(200)).body;
    const t2 = floor[0].tables.find((t: { name: string }) => t.name === 'T2');
    expect(t2.order).toMatchObject({ orderId: a, mergedInto: 'T1' });

    const bill = (
      await ctx.http().post(`/api/orders/${a}/bills`).set(cashier.auth).send({}).expect(201)
    ).body;
    expect(bill.lines).toHaveLength(2);
    await ctx
      .http()
      .post(`/api/bills/${bill.id}/payments`)
      .set(cashier.auth)
      .send({ mode: 'CASH', amount: bill.total })
      .expect(201);
    await seat(r.t2.id).expect(201);
  });

  it('refuses to merge an order that already has a bill, or an order into itself', async () => {
    const a = await servedOrder(ctx, r, waiter, roti(), r.t1.id);
    const b = await servedOrder(ctx, r, waiter, roti(), r.t2.id);
    await ctx.http().post(`/api/orders/${b}/bills`).set(cashier.auth).send({}).expect(201);
    const res = await merge(a, b).expect(409);
    expect(res.body.code).toBe('HAS_BILLS');
    await merge(a, a).expect(400);
  });

  it('needs a signed-in member of staff', async () => {
    const orderId = await servedOrder(ctx, r, waiter, roti());
    await ctx.http().post(`/api/orders/${orderId}/move`).send({ tableId: r.t2.id }).expect(401);
  });
});
