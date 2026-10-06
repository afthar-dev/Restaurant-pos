import type { Outlet } from '@prisma/client';
import { billFor, pay } from './billing-helpers';
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

describe('QR ordering', () => {
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
    cashier = await signIn(ctx, outlet.id, 'CASHIER', 'Kavya');
    waiter = await signIn(ctx, outlet.id, 'WAITER', 'Arun');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 0 })
      .expect(201);
  });

  const start = (code: string) => ctx.http().post('/api/qr/sessions').send({ code });
  const scan = async (code = r.t1.qrToken) => (await start(code).expect(201)).body.token as string;
  const menu = (token: string) => ctx.http().get('/api/qr/menu').set('x-qr-session', token);

  describe('sessions and menu', () => {
    it('starts a session from the table sticker', async () => {
      const res = await start(r.t1.qrToken).expect(201);
      expect(res.body).toEqual({
        token: expect.any(String),
        table: { name: 'T1' },
        outlet: { name: outlet.name },
      });
      const stored = await ctx.prisma.qrSession.findFirstOrThrow();
      expect(stored.tokenHash).not.toBe(res.body.token);
    });

    it('refuses an unknown or archived table code', async () => {
      const unknown = await start('x'.repeat(40)).expect(404);
      expect(unknown.body.code).toBe('QR_UNKNOWN');
      await ctx.prisma.diningTable.update({
        where: { id: r.t2.id },
        data: { archivedAt: new Date() },
      });
      await start(r.t2.qrToken).expect(404);
    });

    it('shows only what can be ordered now, at dine-in prices', async () => {
      const res = await menu(await scan()).expect(200);
      const items = res.body.categories.flatMap((c: { items: { name: string }[] }) => c.items) as {
        name: string;
        variants: { name: string; price: number }[];
        addonGroups: { addons: { name: string }[] }[];
      }[];
      expect(items.map((i) => i.name)).not.toContain('Veg Soup');
      const paneer = items.find((i) => i.name === 'Paneer Tikka')!;
      expect(paneer.variants).toEqual([
        { id: r.paneer.half.id, name: 'Half', price: 18000 },
        { id: r.paneer.full.id, name: 'Full', price: 32000 },
      ]);
      expect(paneer.addonGroups[0]!.addons.map((a) => a.name)).toEqual(['Cheese']);
    });

    it('needs a live session', async () => {
      const missing = await ctx.http().get('/api/qr/menu').expect(401);
      expect(missing.body.code).toBe('QR_SESSION_ENDED');
      await menu('not-a-session').expect(401);
      const token = await scan();
      await ctx.prisma.qrSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await menu(token).expect(401);
    });

    it('ends the session when the table is paid and free again', async () => {
      const token = await scan();
      const bill = await billFor(ctx, r, waiter, cashier, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      await menu(token).expect(200);
      await pay(ctx, cashier, bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
      const ended = await menu(token).expect(401);
      expect(ended.body.message).toBe('Scan the table QR again.');
      await menu(await scan()).expect(200);
    });

    it('ends the session when the order is moved to another table', async () => {
      const token = await scan();
      const created = await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
        .expect(201);
      await ctx
        .http()
        .post(`/api/orders/${created.body.id}/move`)
        .set(waiter.auth)
        .send({ tableId: r.t2.id })
        .expect(201);
      await menu(token).expect(401);
    });
  });

  const paneerWithCheese = () => ({
    variantId: r.paneer.half.id,
    quantity: 2,
    addonIds: [r.extras.cheese.id],
  });
  const submit = (token: string, body: object, key?: string) => {
    const req = ctx.http().post('/api/qr/orders').set('x-qr-session', token);
    return (key ? req.set('Idempotency-Key', key) : req).send(body);
  };

  describe('submitting', () => {
    it('holds a free table with a pending order and shows the customer what they asked for', async () => {
      const token = await scan();
      const res = await submit(token, { lines: [paneerWithCheese()], note: 'less spicy' }).expect(
        201,
      );
      expect(res.body).toMatchObject({
        status: 'PENDING',
        message: 'Waiting for the staff to confirm',
        note: 'less spicy',
        total: 42000,
        lines: [
          {
            itemName: 'Paneer Tikka',
            variantName: 'Half',
            addons: ['Cheese'],
            quantity: 2,
            amount: 42000,
          },
        ],
      });
      const order = await ctx.prisma.order.findFirstOrThrow({ where: { tableId: r.t1.id } });
      expect(order).toMatchObject({ status: 'PENDING_APPROVAL', source: 'QR', createdById: null });
      expect(await ctx.prisma.orderItem.count()).toBe(0);
      const seat = await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
        .expect(409);
      expect(seat.body.code).toBe('TABLE_BUSY');
      const mine = await ctx.http().get('/api/qr/orders').set('x-qr-session', token).expect(200);
      expect(mine.body.map((s: { id: string }) => s.id)).toEqual([res.body.id]);
    });

    it('adds to the running order of a seated table without touching its dishes', async () => {
      const created = await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
        .expect(201);
      await submit(await scan(), { lines: [paneerWithCheese()] }).expect(201);
      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(order.status).toBe('OPEN');
      expect(await ctx.prisma.qrSubmission.count({ where: { orderId: order.id } })).toBe(1);
      expect(await ctx.prisma.orderItem.count()).toBe(0);
    });

    it('refuses dishes that are out of stock and tables whose bill is printed', async () => {
      const token = await scan();
      const soldOut = await submit(token, {
        lines: [{ variantId: r.soup.regular.id, quantity: 1, addonIds: [] }],
      }).expect(409);
      expect(soldOut.body.code).toBe('ITEM_UNAVAILABLE');

      const other = await scan(r.t2.qrToken);
      await billFor(
        ctx,
        r,
        waiter,
        cashier,
        [{ variantId: r.roti.regular.id, quantity: 1 }],
        r.t2.id,
      );
      const billed = await submit(other, { lines: [paneerWithCheese()] }).expect(409);
      expect(billed.body).toMatchObject({
        code: 'QR_BILL_PRINTED',
        message: 'The bill is already printed. Please call the waiter.',
      });
    });

    it('records one submission when the phone retries', async () => {
      const token = await scan();
      const first = await submit(token, { lines: [paneerWithCheese()] }, 'try-1').expect(201);
      const again = await submit(token, { lines: [paneerWithCheese()] }, 'try-1').expect(201);
      expect(again.body.id).toBe(first.body.id);
      expect(await ctx.prisma.qrSubmission.count()).toBe(1);
      const stranger = await scan(r.t2.qrToken);
      await submit(stranger, { lines: [paneerWithCheese()] }, 'try-1').expect(409);
    });

    it('gives a table one order when two phones submit at once', async () => {
      const [a, b] = [await scan(), await scan()];
      const results = await Promise.all([
        submit(a, { lines: [paneerWithCheese()] }),
        submit(b, { lines: [{ variantId: r.roti.regular.id, quantity: 2, addonIds: [] }] }),
      ]);
      expect(results.map((res) => res.status)).toEqual([201, 201]);
      expect(await ctx.prisma.order.count({ where: { tableId: r.t1.id } })).toBe(1);
      expect(await ctx.prisma.qrSubmission.count()).toBe(2);
    });

    it('slows down a phone that keeps submitting', async () => {
      const token = await scan();
      const line = { variantId: r.roti.regular.id, quantity: 1, addonIds: [] };
      for (let i = 0; i < 3; i += 1) await submit(token, { lines: [line] }).expect(201);
      const busy = await submit(token, { lines: [line] }).expect(429);
      expect(busy.body.code).toBe('QR_TOO_MANY');
    });

    it('takes no orders while the day is closed', async () => {
      const token = await scan();
      await ctx.prisma.businessDay.updateMany({ data: { status: 'CLOSED' } });
      const res = await submit(token, { lines: [paneerWithCheese()] }).expect(409);
      expect(res.body.code).toBe('DAY_NOT_OPEN');
    });
  });

  describe('staff decisions', () => {
    async function pendingOn(code = r.t1.qrToken, lines = [paneerWithCheese()]) {
      const token = await scan(code);
      const res = await submit(token, { lines }).expect(201);
      return { token, submission: res.body };
    }
    const approve = (id: string, body: object = {}, who = waiter) =>
      ctx.http().post(`/api/qr/submissions/${id}/approve`).set(who.auth).send(body);
    const reject = (id: string, body: object = {}, who = waiter) =>
      ctx.http().post(`/api/qr/submissions/${id}/reject`).set(who.auth).send(body);
    const status = async (token: string) =>
      (await ctx.http().get('/api/qr/orders').set('x-qr-session', token).expect(200)).body[0];

    it('lists waiting requests and shows them on the order', async () => {
      const { submission } = await pendingOn();
      const list = await ctx.http().get('/api/qr/pending').set(cashier.auth).expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ id: submission.id, tableName: 'T1', total: 42000 }),
      ]);
      expect(list.body[0].lines[0]).toMatchObject({
        variantId: r.paneer.half.id,
        addonIds: [r.extras.cheese.id],
        itemName: 'Paneer Tikka',
        quantity: 2,
      });
      const orderId = list.body[0].orderId;
      const order = await ctx.http().get(`/api/orders/${orderId}`).set(waiter.auth).expect(200);
      expect(order.body.status).toBe('PENDING_APPROVAL');
      expect(order.body.qrPending.map((p: { id: string }) => p.id)).toEqual([submission.id]);
    });

    it('approves: the dishes go on the order and to the kitchen, and the customer is told', async () => {
      const kds = await createDevice(ctx.prisma, outlet.id, owner.user.id, 'KDS', 'Kitchen');
      const { token, submission } = await pendingOn();
      const res = await approve(submission.id).expect(201);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.waiter).toMatchObject({ id: waiter.user.id });
      expect(res.body.items).toEqual([
        expect.objectContaining({ itemName: 'Paneer Tikka', quantity: 2, status: 'SENT' }),
      ]);
      expect(res.body.qrPending).toEqual([]);
      const tickets = await ctx
        .http()
        .get('/api/kds/kots')
        .set('Cookie', `rpos_dt=${kds.cookie}`)
        .expect(200);
      expect(tickets.body).toHaveLength(1);
      expect(await status(token)).toMatchObject({
        status: 'APPROVED',
        message: 'Accepted — sent to the kitchen',
      });
      const twice = await approve(submission.id).expect(409);
      expect(twice.body.code).toBe('QR_ALREADY_DECIDED');
      expect(await ctx.prisma.kot.count()).toBe(1);
    });

    it('approves what the staff edited', async () => {
      const { submission } = await pendingOn();
      const res = await approve(submission.id, {
        lines: [{ variantId: r.paneer.half.id, quantity: 1, addonIds: [] }],
      }).expect(201);
      expect(res.body.items).toEqual([
        expect.objectContaining({ itemName: 'Paneer Tikka', quantity: 1, addons: [] }),
      ]);
    });

    it('keeps the request waiting when a dish ran out before approval', async () => {
      const { submission } = await pendingOn();
      await ctx.prisma.item.update({
        where: { id: r.paneer.item.id },
        data: { isAvailable: false },
      });
      const res = await approve(submission.id).expect(409);
      expect(res.body.code).toBe('ITEM_UNAVAILABLE');
      const stored = await ctx.prisma.qrSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      expect(stored.status).toBe('PENDING');
      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: stored.orderId } });
      expect(order.status).toBe('PENDING_APPROVAL');
      expect(await ctx.prisma.orderItem.count()).toBe(0);
    });

    it('rejects: an empty pending table is freed and the customer is told', async () => {
      const { token, submission } = await pendingOn();
      await reject(submission.id, { reason: 'Kitchen closing' }).expect(201);
      expect(await status(token)).toMatchObject({
        status: 'REJECTED',
        message: 'Not accepted — please call the waiter',
      });
      const order = await ctx.prisma.order.findFirstOrThrow({ where: { tableId: r.t1.id } });
      expect(order).toMatchObject({ status: 'CANCELLED', cancelReason: 'QR order not accepted' });
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
        .expect(201);
    });

    it('rejects one request on a seated table without touching the order', async () => {
      const created = await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
        .expect(201);
      const { submission } = await pendingOn();
      await reject(submission.id).expect(201);
      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(order.status).toBe('OPEN');
    });

    it('keeps other outlets out', async () => {
      const { submission } = await pendingOn();
      const elsewhere = await createOutlet(ctx.prisma);
      const stranger = await signIn(ctx, elsewhere.id, 'OWNER');
      await approve(submission.id, {}, stranger).expect(404);
      const list = await ctx.http().get('/api/qr/pending').set(stranger.auth).expect(200);
      expect(list.body).toEqual([]);
    });
  });

  describe('table QR codes', () => {
    it('lists every table code for printing stickers, to owners only', async () => {
      const res = await ctx.http().get('/api/tables/qr').set(owner.auth).expect(200);
      expect(res.body).toEqual([
        { id: r.t1.id, name: 'T1', areaName: 'AC Hall', qrToken: r.t1.qrToken },
        { id: r.t2.id, name: 'T2', areaName: 'AC Hall', qrToken: r.t2.qrToken },
      ]);
      await ctx.http().get('/api/tables/qr').set(cashier.auth).expect(403);
    });

    it('replaces a lost sticker: the old code stops working and its sessions end', async () => {
      const token = await scan();
      const res = await ctx
        .http()
        .post(`/api/tables/${r.t1.id}/qr/rotate`)
        .set(owner.auth)
        .expect(201);
      expect(res.body.qrToken).not.toBe(r.t1.qrToken);
      expect(res.body.qrToken.length).toBeGreaterThanOrEqual(40);
      await start(r.t1.qrToken).expect(404);
      await menu(token).expect(401);
      await menu(await scan(res.body.qrToken)).expect(200);
      await ctx.http().post(`/api/tables/${r.t1.id}/qr/rotate`).set(waiter.auth).expect(403);
    });
  });
});
