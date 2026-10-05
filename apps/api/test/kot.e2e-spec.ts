import type { Outlet } from '@prisma/client';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
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

describe('KOTs and the kitchen', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let r: Restaurant;
  let manager: SignedIn;
  let waiter: SignedIn;
  let kds: { id: string; cookie: string };

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
    manager = await signIn(ctx, outlet.id, 'MANAGER', 'Meera');
    waiter = await signIn(ctx, outlet.id, 'WAITER', 'Arun');
    kds = await createDevice(ctx.prisma, outlet.id, manager.user.id, 'KDS', 'Kitchen screen');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(manager.auth)
      .send({ openingCash: 0 })
      .expect(201);
  });

  async function orderWith(items: { variantId: string; quantity: number }[]) {
    const order = (
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
        .expect(201)
    ).body;
    await ctx
      .http()
      .post(`/api/orders/${order.id}/items`)
      .set(waiter.auth)
      .send({ items: items.map((i) => ({ ...i, addonIds: [] })) })
      .expect(201);
    return order.id as string;
  }

  async function orderWith2() {
    const order = (
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t2.id, guests: 2 })
        .expect(201)
    ).body;
    await ctx
      .http()
      .post(`/api/orders/${order.id}/items`)
      .set(waiter.auth)
      .send({ items: [{ variantId: r.roti.regular.id, quantity: 1, addonIds: [] }] })
      .expect(201);
    return order.id as string;
  }

  const sendKot = (orderId: string, headers: Record<string, string> = {}) =>
    ctx
      .http()
      .post(`/api/orders/${orderId}/kot`)
      .set({ ...waiter.auth, ...headers });

  const kdsGet = () => ctx.http().get('/api/kds/kots').set('Cookie', `rpos_dt=${kds.cookie}`);

  it('splits a KOT per station with sequential numbers and marks items sent', async () => {
    const orderId = await orderWith([
      { variantId: r.paneer.half.id, quantity: 1 },
      { variantId: r.roti.regular.id, quantity: 4 },
    ]);
    const res = await sendKot(orderId).expect(201);
    expect(
      res.body.kots
        .map((k: { stationName: string; kotNo: number }) => [k.stationName, k.kotNo])
        .sort(),
    ).toEqual([
      ['Kitchen', expect.any(Number)],
      ['Tandoor', expect.any(Number)],
    ]);
    expect(res.body.kots.map((k: { kotNo: number }) => k.kotNo).sort()).toEqual([1, 2]);
    expect(res.body.order.items.every((i: { status: string }) => i.status === 'SENT')).toBe(true);

    const again = await sendKot(orderId).expect(409);
    expect(again.body.code).toBe('NOTHING_TO_SEND');
  });

  it('only sends items added since the last KOT', async () => {
    const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
    await sendKot(orderId).expect(201);
    await ctx
      .http()
      .post(`/api/orders/${orderId}/items`)
      .set(waiter.auth)
      .send({ items: [{ variantId: r.paneer.full.id, quantity: 2, addonIds: [] }] });
    const second = await sendKot(orderId).expect(201);
    expect(second.body.kots).toHaveLength(1);
    const lines = await ctx.prisma.kotLine.findMany({ where: { kotId: second.body.kots[0].id } });
    expect(lines.map((l) => [l.variantName, l.quantity])).toEqual([['Full', 2]]);
  });

  it('returns the first result when the same Idempotency-Key is retried', async () => {
    const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
    const first = await sendKot(orderId, { 'Idempotency-Key': 'tap-1' }).expect(201);
    const retry = await sendKot(orderId, { 'Idempotency-Key': 'tap-1' }).expect(201);
    expect(retry.body.kots.map((k: { id: string }) => k.id)).toEqual(
      first.body.kots.map((k: { id: string }) => k.id),
    );
    expect(await ctx.prisma.kot.count()).toBe(1);
  });

  it('replays a retried send even when it carries the old If-Match version (review I#2)', async () => {
    const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
    const headers = { 'Idempotency-Key': 'tap-2', 'If-Match': '1' };
    const first = await sendKot(orderId, headers).expect(201);
    const retry = await sendKot(orderId, headers).expect(201);
    expect(retry.body.kots.map((k: { id: string }) => k.id)).toEqual(
      first.body.kots.map((k: { id: string }) => k.id),
    );
    expect(retry.body.order.version).toBe(first.body.order.version);
    expect(await ctx.prisma.kot.count()).toBe(1);
  });

  it('refuses to reuse an Idempotency-Key for a different order', async () => {
    const a = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
    await sendKot(a, { 'Idempotency-Key': 'tap-3' }).expect(201);
    const b = (
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t2.id, guests: 1 })
    ).body.id;
    await ctx
      .http()
      .post(`/api/orders/${b}/items`)
      .set(waiter.auth)
      .send({ items: [{ variantId: r.roti.regular.id, quantity: 1, addonIds: [] }] });
    const res = await sendKot(b, { 'Idempotency-Key': 'tap-3' }).expect(409);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('creates one KOT set when two devices send at the same moment', async () => {
    const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
    const results = await Promise.all([sendKot(orderId), sendKot(orderId), sendKot(orderId)]);
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect(await ctx.prisma.kot.count()).toBe(1);
  });

  describe('cancelling sent items', () => {
    it('needs a manager', async () => {
      const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 2 }]);
      const sent = await sendKot(orderId).expect(201);
      const itemId = sent.body.order.items[0].id;
      await ctx
        .http()
        .post(`/api/orders/${orderId}/items/${itemId}/cancel`)
        .set(waiter.auth)
        .send({ reason: 'Customer changed mind' })
        .expect(403);
    });

    it('sends a CANCEL KOT to the same station and audits the approval', async () => {
      const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 3 }]);
      const sent = await sendKot(orderId).expect(201);
      const itemId = sent.body.order.items[0].id;

      const override = await ctx
        .http()
        .post('/api/auth/override')
        .set(waiter.auth)
        .send({ userId: manager.user.id, pin: '9999', permission: 'item.cancelAfterKot' })
        .expect(201);
      const res = await ctx
        .http()
        .post(`/api/orders/${orderId}/items/${itemId}/cancel`)
        .set({ ...waiter.auth, 'x-override-token': override.body.overrideToken })
        .send({ reason: 'Customer changed mind', quantity: 1 })
        .expect(201);

      const items = res.body.items as { status: string; quantity: number }[];
      expect(items.map((i) => [i.status, i.quantity]).sort()).toEqual([
        ['CANCELLED', 1],
        ['SENT', 2],
      ]);
      expect(res.body.subtotal).toBe(36000);

      const cancelKot = await ctx.prisma.kot.findFirstOrThrow({
        where: { type: 'CANCEL' },
        include: { lines: true },
      });
      expect(cancelKot.stationName).toBe('Kitchen');
      expect(cancelKot.lines.map((l) => [l.itemName, l.quantity])).toEqual([['Paneer Tikka', 1]]);

      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'order.item.cancel' },
      });
      expect(audit).toMatchObject({ actorId: manager.user.id, reason: 'Customer changed mind' });
      expect(audit.after).toMatchObject({ quantity: 1, requestedBy: waiter.user.id });
    });

    it('voids a whole order with KOTs in the kitchen', async () => {
      const orderId = await orderWith([
        { variantId: r.paneer.half.id, quantity: 1 },
        { variantId: r.roti.regular.id, quantity: 2 },
      ]);
      await sendKot(orderId).expect(201);
      const res = await ctx
        .http()
        .post(`/api/orders/${orderId}/void`)
        .set(manager.auth)
        .send({ reason: 'Customer walked out' })
        .expect(201);
      expect(res.body.status).toBe('CANCELLED');
      expect(await ctx.prisma.kot.count({ where: { type: 'CANCEL' } })).toBe(2);
      expect(await ctx.prisma.auditEntry.count({ where: { action: 'order.void' } })).toBe(1);
    });
  });

  describe('kitchen display', () => {
    it('lists active tickets and moves them through preparing and ready to served', async () => {
      const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
      const kotId = (await sendKot(orderId).expect(201)).body.kots[0].id;

      const list = await kdsGet().expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({
          id: kotId,
          kotNo: 1,
          type: 'NEW',
          status: 'NEW',
          stationName: 'Kitchen',
          orderType: 'DINE_IN',
          tableName: 'T1',
          waiterName: 'Arun',
          lines: [
            expect.objectContaining({ itemName: 'Paneer Tikka', variantName: 'Half', quantity: 1 }),
          ],
        }),
      ]);

      const patch = (status: string) =>
        ctx
          .http()
          .patch(`/api/kds/kots/${kotId}`)
          .set('Cookie', `rpos_dt=${kds.cookie}`)
          .send({ status });
      expect((await patch('PREPARING')).status).toBe(200);
      expect((await patch('READY')).status).toBe(200);
      const back = await patch('PREPARING');
      expect(back.status).toBe(409);
      expect(back.body.code).toBe('INVALID_TRANSITION');

      await ctx.http().post(`/api/kots/${kotId}/served`).set(waiter.auth).expect(201);
      expect((await kdsGet()).body).toEqual([]);
    });

    it('filters by station', async () => {
      const orderId = await orderWith([
        { variantId: r.paneer.half.id, quantity: 1 },
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      await sendKot(orderId).expect(201);
      const res = await ctx
        .http()
        .get(`/api/kds/kots?stationId=${r.tandoor.id}`)
        .set('Cookie', `rpos_dt=${kds.cookie}`)
        .expect(200);
      expect(res.body.map((k: { stationName: string }) => k.stationName)).toEqual(['Tandoor']);
    });

    it('includes the station on KOT summaries and rejects a malformed station filter', async () => {
      const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
      const sent = await sendKot(orderId).expect(201);
      expect(sent.body.order.kots[0].stationId).toBe(r.kitchen.id);
      await ctx
        .http()
        .get('/api/kds/kots?stationId=not-a-uuid')
        .set('Cookie', `rpos_dt=${kds.cookie}`)
        .expect(400);
    });

    it('lets staff mark a preparing ticket served but not dismiss a cancellation', async () => {
      const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
      const kotId = (await sendKot(orderId).expect(201)).body.kots[0].id;
      await ctx
        .http()
        .patch(`/api/kds/kots/${kotId}`)
        .set('Cookie', `rpos_dt=${kds.cookie}`)
        .send({ status: 'PREPARING' })
        .expect(200);
      await ctx.http().post(`/api/kots/${kotId}/served`).set(waiter.auth).expect(201);

      const second = await orderWith2();
      await sendKot(second).expect(201);
      await ctx
        .http()
        .post(`/api/orders/${second}/void`)
        .set(manager.auth)
        .send({ reason: 'Mistake' });
      const cancel = await ctx.prisma.kot.findFirstOrThrow({ where: { type: 'CANCEL' } });
      const res = await ctx
        .http()
        .post(`/api/kots/${cancel.id}/served`)
        .set(waiter.auth)
        .expect(409);
      expect(res.body.code).toBe('INVALID_TRANSITION');
    });

    it('refuses devices that are not kitchen screens', async () => {
      const pos = await createDevice(ctx.prisma, outlet.id, manager.user.id, 'POS');
      const res = await ctx
        .http()
        .get('/api/kds/kots')
        .set('Cookie', `rpos_dt=${pos.cookie}`)
        .expect(403);
      expect(res.body.code).toBe('DEVICE_NOT_ALLOWED');
    });

    it('lets the kitchen dismiss a cancellation ticket', async () => {
      const orderId = await orderWith([{ variantId: r.paneer.half.id, quantity: 1 }]);
      await sendKot(orderId).expect(201);
      await ctx
        .http()
        .post(`/api/orders/${orderId}/void`)
        .set(manager.auth)
        .send({ reason: 'Wrong order' })
        .expect(201);
      const cancel = (await kdsGet()).body.find((k: { type: string }) => k.type === 'CANCEL');
      await ctx
        .http()
        .patch(`/api/kds/kots/${cancel.id}`)
        .set('Cookie', `rpos_dt=${kds.cookie}`)
        .send({ status: 'SERVED' })
        .expect(200);
      expect((await kdsGet()).body.find((k: { id: string }) => k.id === cancel.id)).toBeUndefined();
    });
  });
});

describe('audit is part of the change (review I#1)', () => {
  let ctx: TestContext;
  let r: Restaurant;
  let manager: SignedIn;
  let waiter: SignedIn;

  beforeAll(async () => {
    const failing = {
      record: async (entry: { action: string }, db?: unknown) => {
        if (entry.action === 'order.item.cancel' || entry.action === 'order.void') {
          throw new Error('audit store unavailable');
        }
        const real = ctx.app.get(PrismaService);
        await ((db as typeof real) ?? real).auditEntry.create({ data: entry as never });
      },
      list: async () => [],
    };
    ctx = await createTestApp({
      customize: (b) => b.overrideProvider(AuditService).useValue(failing),
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const outlet = await createOutlet(ctx.prisma);
    r = await buildRestaurant(ctx.prisma, outlet.id);
    manager = await signIn(ctx, outlet.id, 'MANAGER');
    waiter = await signIn(ctx, outlet.id, 'WAITER');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(manager.auth)
      .send({ openingCash: 0 })
      .expect(201);
  });

  async function sentOrder() {
    const order = (
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
    ).body;
    await ctx
      .http()
      .post(`/api/orders/${order.id}/items`)
      .set(waiter.auth)
      .send({ items: [{ variantId: r.paneer.half.id, quantity: 2, addonIds: [] }] });
    const sent = await ctx.http().post(`/api/orders/${order.id}/kot`).set(waiter.auth).expect(201);
    return { orderId: order.id as string, itemId: sent.body.order.items[0].id as string };
  }

  it('does not cancel an item when its audit entry cannot be written', async () => {
    const { orderId, itemId } = await sentOrder();
    await ctx
      .http()
      .post(`/api/orders/${orderId}/items/${itemId}/cancel`)
      .set(manager.auth)
      .send({ reason: 'Customer changed mind' })
      .expect(500);
    const item = await ctx.prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.status).toBe('SENT');
    expect(await ctx.prisma.kot.count({ where: { type: 'CANCEL' } })).toBe(0);
  });

  it('does not void an order when its audit entry cannot be written', async () => {
    const { orderId } = await sentOrder();
    await ctx
      .http()
      .post(`/api/orders/${orderId}/void`)
      .set(manager.auth)
      .send({ reason: 'Customer left' })
      .expect(500);
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('OPEN');
  });
});
