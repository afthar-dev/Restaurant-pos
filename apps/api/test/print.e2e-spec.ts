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

  async function sendPaneerKot(tableId = r.t1.id) {
    const order = (
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId, guests: 3 })
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

  const claimFor = (device: { cookie: string }) =>
    ctx.http().post('/api/print/jobs/claim').set('Cookie', `rpos_dt=${device.cookie}`);

  it('hands a job to only one claimer until its lease runs out', async () => {
    await kitchenPrinter(counter.id).expect(201);
    await sendPaneerKot();
    const [first, second] = await Promise.all([claimFor(counter), claimFor(counter)]);
    expect([first.body.length, second.body.length].sort()).toEqual([0, 1]);
    expect((await claimFor(counter).expect(201)).body).toEqual([]);

    await ctx.prisma.printJob.updateMany({ data: { leaseUntil: new Date(Date.now() - 1000) } });
    expect((await claimFor(counter).expect(201)).body).toHaveLength(1);
    expect((await claimFor(other).expect(201)).body).toEqual([]);
  });

  it('waits before offering a failed print again', async () => {
    await kitchenPrinter(counter.id).expect(201);
    await sendPaneerKot();
    const [job] = (await claimFor(counter)).body;
    await ctx
      .http()
      .post(`/api/print/jobs/${job.id}/done`)
      .set('Cookie', `rpos_dt=${counter.cookie}`)
      .send({ ok: false })
      .expect(201);
    expect((await claimFor(counter)).body).toEqual([]);
    const stored = await ctx.prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not auto-print a job that waited too long', async () => {
    await kitchenPrinter(counter.id).expect(201);
    await sendPaneerKot();
    await ctx.prisma.printJob.updateMany({ data: { createdAt: new Date(Date.now() - 3_600_000) } });
    expect((await claimFor(counter)).body).toEqual([]);
  });

  it('counts concurrent failure reports against the cap', async () => {
    await kitchenPrinter(counter.id).expect(201);
    await sendPaneerKot();
    const [job] = (await jobsFor(counter)).body;
    const report = () =>
      ctx
        .http()
        .post(`/api/print/jobs/${job.id}/done`)
        .set('Cookie', `rpos_dt=${counter.cookie}`)
        .send({ ok: false });
    await Promise.all([report(), report(), report(), report()]);
    const stored = await ctx.prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: 'FAILED', attempts: 3 });
  });

  it('shows on the order whether each KOT printed', async () => {
    const printState = async (orderId: string) =>
      (await ctx.http().get(`/api/orders/${orderId}`).set(waiter.auth).expect(200)).body.kots[0]
        .print;
    const noPrinter = await sendPaneerKot();
    expect(await printState(noPrinter.order.id)).toBe('NONE');

    await kitchenPrinter(counter.id).expect(201);
    const sent = await sendPaneerKot(r.t2.id);
    expect(await printState(sent.order.id)).toBe('WAITING');
    const [job] = (await claimFor(counter)).body;
    for (let i = 0; i < 3; i += 1) {
      await ctx
        .http()
        .post(`/api/print/jobs/${job.id}/done`)
        .set('Cookie', `rpos_dt=${counter.cookie}`)
        .send({ ok: false });
    }
    expect(await printState(sent.order.id)).toBe('FAILED');

    await ctx.http().post(`/api/kots/${sent.kots[0].id}/reprint`).set(waiter.auth).expect(201);
    expect(await printState(sent.order.id)).toBe('WAITING');
    const [again] = (await claimFor(counter)).body;
    await ctx
      .http()
      .post(`/api/print/jobs/${again.id}/done`)
      .set('Cookie', `rpos_dt=${counter.cookie}`)
      .send({ ok: true })
      .expect(201);
    expect(await printState(sent.order.id)).toBe('PRINTED');
  });

  it('tells the counter when no bill printer took the bill, and gives it the bill to print', async () => {
    const cashier = await signIn(ctx, outlet.id, 'CASHIER', 'Kavya');
    const sent = await sendPaneerKot();
    const bill = (
      await ctx
        .http()
        .post(`/api/orders/${sent.order.id}/bills`)
        .set(cashier.auth)
        .send({})
        .expect(201)
    ).body;
    const reprint = await ctx
      .http()
      .post(`/api/bills/${bill.id}/print`)
      .set(cashier.auth)
      .expect(201);
    expect(reprint.body).toEqual({ id: bill.id, queued: 0 });
    const payload = await ctx
      .http()
      .get(`/api/bills/${bill.id}/print-payload?paperWidthMm=58`)
      .set(cashier.auth)
      .expect(200);
    expect(payload.body).toMatchObject({
      kind: 'BILL',
      billNo: 1,
      paperWidthMm: 58,
      total: bill.total,
      cashierName: 'Kavya',
    });
    const elsewhere = await ctx.prisma.outlet.create({ data: { name: 'Other' } });
    const stranger = await signIn(ctx, elsewhere.id, 'OWNER');
    await ctx.http().get(`/api/bills/${bill.id}/print-payload`).set(stranger.auth).expect(404);
  });

  it('prints the bill on the bill printer and reprints it on request', async () => {
    const cashier = await signIn(ctx, outlet.id, 'CASHIER', 'Kavya');
    await kitchenPrinter(counter.id).expect(201);
    await ctx
      .http()
      .post('/api/printers')
      .set(owner.auth)
      .send({
        name: 'Bill printer',
        purpose: 'BILL',
        mode: 'BROWSER',
        paperWidthMm: 58,
        deviceId: counter.id,
      })
      .expect(201);
    const sent = await sendPaneerKot();
    const bill = (
      await ctx
        .http()
        .post(`/api/orders/${sent.order.id}/bills`)
        .set(cashier.auth)
        .send({})
        .expect(201)
    ).body;

    const jobs = (await claimFor(counter).expect(201)).body;
    expect(jobs.map((j: { kind: string }) => j.kind).sort()).toEqual(['BILL', 'KOT']);
    const billJob = jobs.find((j: { kind: string }) => j.kind === 'BILL');
    expect(billJob.payload).toMatchObject({
      kind: 'BILL',
      title: 'Tax Invoice',
      billNo: 1,
      status: 'OPEN',
      tableName: 'T1',
      waiterName: 'Arun',
      cashierName: 'Kavya',
      paperWidthMm: 58,
      total: bill.total,
      outlet: { name: outlet.name },
      lines: [
        {
          itemName: 'Paneer Tikka',
          variantName: 'Half',
          addons: ['Cheese'],
          quantity: 2,
          unitPrice: 21000,
          amount: 42000,
        },
      ],
      taxBreakup: [{ ratePercent: '5%', taxable: 42000, cgst: 1050, sgst: 1050 }],
    });

    await ctx.http().post(`/api/bills/${bill.id}/print`).set(cashier.auth).expect(201);
    const again = (await claimFor(counter).expect(201)).body;
    expect(again.map((j: { kind: string }) => j.kind)).toEqual(['BILL']);
  });

  it('queues another job on reprint', async () => {
    await kitchenPrinter(counter.id).expect(201);
    const sent = await sendPaneerKot();
    await ctx.http().post(`/api/kots/${sent.kots[0].id}/reprint`).set(waiter.auth).expect(201);
    expect((await jobsFor(counter)).body).toHaveLength(2);
  });
});
