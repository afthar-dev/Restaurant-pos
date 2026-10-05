import type { Outlet } from '@prisma/client';
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

describe('print jobs', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let r: Restaurant;
  let owner: SignedIn;
  let waiter: SignedIn;
  let counter: { id: string; cookie: string };
  let other: { id: string; cookie: string };

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
    waiter = await signIn(ctx, outlet.id, 'WAITER', 'Arun');
    counter = await createDevice(ctx.prisma, outlet.id, owner.user.id, 'POS', 'Counter 1');
    other = await createDevice(ctx.prisma, outlet.id, owner.user.id, 'POS', 'Counter 2');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 0 })
      .expect(201);
  });

  function kitchenPrinter(deviceId: string | null) {
    return ctx.http().post('/api/printers').set(owner.auth).send({
      name: 'Kitchen printer',
      purpose: 'KOT',
      stationId: r.kitchen.id,
      mode: 'BROWSER',
      paperWidthMm: 80,
      deviceId,
    });
  }

  async function sendPaneerKot() {
    const order = (
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 3 })
    ).body;
    await ctx
      .http()
      .post(`/api/orders/${order.id}/items`)
      .set(waiter.auth)
      .send({
        items: [
          {
            variantId: r.paneer.half.id,
            quantity: 2,
            addonIds: [r.extras.cheese.id],
            note: 'no onion',
          },
        ],
      });
    return (await ctx.http().post(`/api/orders/${order.id}/kot`).set(waiter.auth).expect(201)).body;
  }

  const jobsFor = (device: { cookie: string }) =>
    ctx.http().get('/api/print/jobs').set('Cookie', `rpos_dt=${device.cookie}`);

  it('assigns a printer to a device and shows that device', async () => {
    const res = await kitchenPrinter(counter.id).expect(201);
    expect(res.body.device).toEqual({ id: counter.id, name: 'Counter 1' });
  });

  it('refuses a device from another outlet', async () => {
    const elsewhere = await ctx.prisma.outlet.create({ data: { name: 'Other' } });
    const foreign = await createDevice(ctx.prisma, elsewhere.id, owner.user.id);
    const res = await kitchenPrinter(foreign.id).expect(400);
    expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'deviceId' });
  });

  it('queues a KOT print job for the device that owns the station printer', async () => {
    await kitchenPrinter(counter.id).expect(201);
    await sendPaneerKot();

    const mine = await jobsFor(counter).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({
      kind: 'KOT',
      payload: {
        kind: 'KOT',
        kotNo: 1,
        kotType: 'NEW',
        stationName: 'Kitchen',
        orderType: 'DINE_IN',
        tableName: 'T1',
        waiterName: 'Arun',
        guests: 3,
        paperWidthMm: 80,
        lines: [
          {
            quantity: 2,
            itemName: 'Paneer Tikka',
            variantName: 'Half',
            addons: ['Cheese'],
            note: 'no onion',
            combo: [],
          },
        ],
      },
    });
    expect((await jobsFor(other).expect(200)).body).toEqual([]);
  });

  it('marks a job printed or failed', async () => {
    await kitchenPrinter(counter.id).expect(201);
    await sendPaneerKot();
    const [job] = (await jobsFor(counter)).body;
    await ctx
      .http()
      .post(`/api/print/jobs/${job.id}/done`)
      .set('Cookie', `rpos_dt=${counter.cookie}`)
      .send({ ok: false })
      .expect(201);
    expect((await jobsFor(counter)).body).toHaveLength(1);
    await ctx
      .http()
      .post(`/api/print/jobs/${job.id}/done`)
      .set('Cookie', `rpos_dt=${counter.cookie}`)
      .send({ ok: true })
      .expect(201);
    expect((await jobsFor(counter)).body).toEqual([]);
    const stored = await ctx.prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: 'PRINTED', attempts: 2 });
  });

  it('gives up on a job after three failed prints', async () => {
    await kitchenPrinter(counter.id).expect(201);
    await sendPaneerKot();
    const [job] = (await jobsFor(counter)).body;
    for (let i = 0; i < 3; i += 1) {
      await ctx
        .http()
        .post(`/api/print/jobs/${job.id}/done`)
        .set('Cookie', `rpos_dt=${counter.cookie}`)
        .send({ ok: false })
        .expect(201);
    }
    expect((await jobsFor(counter)).body).toEqual([]);
    const stored = await ctx.prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: 'FAILED', attempts: 3 });
  });

  it('does not let another device finish someone else’s job', async () => {
    await kitchenPrinter(counter.id).expect(201);
    await sendPaneerKot();
    const [job] = (await jobsFor(counter)).body;
    await ctx
      .http()
      .post(`/api/print/jobs/${job.id}/done`)
      .set('Cookie', `rpos_dt=${other.cookie}`)
      .send({ ok: true })
      .expect(404);
  });

  it('keeps a job for a printer with no device so it is not lost', async () => {
    await kitchenPrinter(null).expect(201);
    await sendPaneerKot();
    const job = await ctx.prisma.printJob.findFirstOrThrow();
    expect(job).toMatchObject({ deviceId: null, status: 'PENDING' });
  });

  it('queues another job on reprint', async () => {
    await kitchenPrinter(counter.id).expect(201);
    const sent = await sendPaneerKot();
    await ctx.http().post(`/api/kots/${sent.kots[0].id}/reprint`).set(waiter.auth).expect(201);
    expect((await jobsFor(counter)).body).toHaveLength(2);
  });
});
