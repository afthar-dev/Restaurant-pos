import type { Outlet } from '@prisma/client';
import { financialYear } from '../src/billing/financial-year';
import { billFor as billForOn, pay as payOn, type Line } from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

const BOM = '\uFEFF';

describe('GST report and bill register', () => {
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
    await ctx.http().post('/api/business-day/open').set(owner.auth).send({ openingCash: 0 });
  });

  const billFor = (lines: Line[], tableId = r.t1.id) =>
    billForOn(ctx, r, waiter, cashier, lines, tableId);
  const pay = (billId: string, body: object) => payOn(ctx, cashier, billId, body);
  const gst = (from: string, to: string, who = owner) =>
    ctx.http().get(`/api/reports/gst?from=${from}&to=${to}`).set(who.auth);
  const register = (from: string, to: string, who = owner) =>
    ctx
      .http()
      .get(`/api/reports/bill-register.csv?from=${from}&to=${to}`)
      .set(who.auth)
      .buffer(true)
      .parse((res, done) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (data += c));
        res.on('end', () => done(null, data));
      });
  const setCreatedAt = (billId: string, iso: string) =>
    ctx.prisma.bill.update({
      where: { id: billId },
      data: { createdAt: new Date(iso), financialYear: financialYear(new Date(iso)) },
    });

  it('files bills by invoice date in India time and by financial year (midnight on 31 March)', async () => {
    const before = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
    const after = await billFor([{ variantId: r.roti.regular.id, quantity: 2 }], r.t2.id);
    // 23:59 IST on 31 March and 00:01 IST on 1 April.
    await setCreatedAt(before.id, '2027-03-31T18:29:00Z');
    await setCreatedAt(after.id, '2027-03-31T18:31:00Z');

    const march = (await gst('2027-03-01', '2027-03-31').expect(200)).body;
    expect(march.series).toEqual([
      { fy: '2026-27', first: before.billNo, last: before.billNo, count: 1, voided: 0 },
    ]);
    expect(march.b2cByRate).toEqual([
      {
        ratePercent: 5,
        taxable: before.taxable,
        cgst: before.cgst,
        sgst: before.sgst,
        total: before.taxable + before.cgst + before.sgst,
      },
    ]);

    const april = (await gst('2027-04-01', '2027-04-02').expect(200)).body;
    expect(april.series).toEqual([
      { fy: '2027-28', first: after.billNo, last: after.billNo, count: 1, voided: 0 },
    ]);
    expect(april.b2cByRate[0].taxable).toBe(after.taxable);

    const both = (await gst('2027-03-31', '2027-04-01').expect(200)).body;
    expect(both.series.map((s: { fy: string }) => s.fy)).toEqual(['2026-27', '2027-28']);
    expect(both.range).toEqual({ from: '2027-03-31', to: '2027-04-01' });
  });

  it('adds up rate rows, exempt and SAC, counting voided bills only in the series', async () => {
    // One bill with a 5% roti and a No-GST item.
    await ctx.prisma.item.update({ where: { id: r.paneer.item.id }, data: { taxRateId: null } });
    const mixed = await billFor([
      { variantId: r.roti.regular.id, quantity: 2 },
      { variantId: r.paneer.half.id, quantity: 1 },
    ]);
    const voided = await billFor([{ variantId: r.roti.regular.id, quantity: 5 }], r.t2.id);
    await ctx
      .http()
      .post(`/api/bills/${voided.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Wrong table' })
      .expect(201);
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

    const res = (await gst(today, today).expect(200)).body;
    expect(res.scheme).toBe('REGULAR');
    expect(res.composition).toBeNull();
    expect(res.b2cByRate).toEqual([
      { ratePercent: 5, taxable: 6000, cgst: 150, sgst: 150, total: 6300 },
    ]);
    expect(res.exempt).toBe(18000);
    expect(res.sac).toEqual({ code: '996331', quantity: 3, value: 24000 });
    expect(res.series).toEqual([
      {
        fy: mixed.financialYear,
        first: mixed.billNo,
        last: voided.billNo,
        count: 2,
        voided: 1,
      },
    ]);
  });

  it('fills composition and leaves the rate rows empty for a composition outlet', async () => {
    await ctx.prisma.outlet.update({
      where: { id: outlet.id },
      data: { taxScheme: 'COMPOSITION', gstin: '27AAPFU0939F1ZV' },
    });
    const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 3 }]);
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const res = (await gst(today, today).expect(200)).body;
    expect(res.scheme).toBe('COMPOSITION');
    expect(res.b2cByRate).toEqual([]);
    expect(res.exempt).toBe(0);
    expect(res.composition).toEqual({
      turnover: bill.total,
      taxPayable: Math.round((bill.total * 500) / 10000),
    });
  });

  it('exports one row per bill as UTF-8 CSV with a BOM, a void bill keeping its original totals', async () => {
    const paid = await billFor([{ variantId: r.roti.regular.id, quantity: 2 }]);
    await ctx
      .http()
      .patch(`/api/bills/${paid.id}/customer`)
      .set(cashier.auth)
      .send({ name: 'Acme', gstin: '27ABCDE1234F1Z5' })
      .expect(200);
    await pay(paid.id, { mode: 'CASH', amount: paid.total }).expect(201);
    const voided = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }], r.t2.id);
    await pay(voided.id, { mode: 'UPI', amount: voided.total }).expect(201);
    await ctx
      .http()
      .post(`/api/bills/${voided.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Wrong table' })
      .expect(201);
    await setCreatedAt(paid.id, '2026-10-12T05:30:00Z'); // 11:00 IST
    await setCreatedAt(voided.id, '2026-10-12T18:40:00Z'); // 00:10 IST on the 13th

    const res = await register('2026-10-12', '2026-10-13').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=.*\.csv/);
    const text = res.body as string;
    expect(text.startsWith(BOM)).toBe(true);
    const lines = text.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'Bill no,FY,Date,Time,Type,Table,Subtotal,Discount,Packaging,Taxable,CGST,SGST,Round off,Total,Paid by,Status,Customer GSTIN',
    );
    const rs = (p: number) => (p / 100).toFixed(2);
    expect(lines[1]).toBe(
      [
        paid.billNo,
        '2026-27',
        '2026-10-12',
        '11:00',
        'DINE_IN',
        '"T1"',
        rs(paid.grossSubtotal),
        rs(paid.itemDiscount + paid.billDiscount),
        rs(paid.packaging),
        rs(paid.taxable),
        rs(paid.cgst),
        rs(paid.sgst),
        rs(paid.roundOff),
        rs(paid.total),
        '"CASH"',
        'PAID',
        '"27ABCDE1234F1Z5"',
      ].join(','),
    );
    // Original totals kept, status VOID.
    expect(lines[2]).toContain(`${voided.billNo},2026-27,2026-10-13,00:10,DINE_IN,"T2"`);
    expect(lines[2]).toContain(`,${rs(voided.total)},"UPI",VOID,""`);

    const empty = await register('2025-01-01', '2025-01-02').expect(200);
    expect((empty.body as string).slice(1).split('\r\n').filter(Boolean)).toHaveLength(1);
  });

  it('needs reports.all and a valid range', async () => {
    await gst('2026-10-12', '2026-10-12', cashier).expect(403);
    await register('2026-10-12', '2026-10-12', cashier).expect(403);
    await gst('2026-10-13', '2026-10-12').expect(400);
    await register('nope', '2026-10-12').expect(400);
  });
});
