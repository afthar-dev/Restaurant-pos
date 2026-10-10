import type { Outlet } from '@prisma/client';
import { billFor as billForOn, parcelOrder, pay as payOn, type Line } from './billing-helpers';
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

describe('sales report', () => {
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
  });

  const openDay = () =>
    ctx.http().post('/api/business-day/open').set(owner.auth).send({ openingCash: 0 }).expect(201);
  const closeDay = () =>
    ctx
      .http()
      .post('/api/business-day/close')
      .set(manager.auth)
      .send({ countedCash: 0 })
      .expect(201);
  const billFor = (lines: Line[], tableId = r.t1.id) =>
    billForOn(ctx, r, waiter, cashier, lines, tableId);
  const pay = (billId: string, body: object) => payOn(ctx, cashier, billId, body);
  const report = (from: string, to: string, who = owner) =>
    ctx.http().get(`/api/reports/sales?from=${from}&to=${to}`).set(who.auth);
  const gasCategory = async () =>
    (
      (await ctx.http().get('/api/expense-categories').set(cashier.auth).expect(200)).body as {
        id: string;
        name: string;
      }[]
    ).find((c) => c.name === 'Gas')!.id;

  it('adds up two days: bills, payments, items, expenses and net', async () => {
    // Yesterday: one cash bill (₹32 roti).
    await openDay();
    const first = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
    await pay(first.id, { mode: 'CASH', amount: first.total }).expect(201);
    const gas = await gasCategory();
    await ctx
      .http()
      .post('/api/expenses')
      .set(cashier.auth)
      .send({ categoryId: gas, amount: 1000, mode: 'CASH' })
      .expect(201);
    await closeDay();
    const yesterday = await ctx.prisma.businessDay.findFirstOrThrow();
    await ctx.prisma.businessDay.update({
      where: { id: yesterday.id },
      data: { openedAt: new Date(Date.now() - 86_400_000) },
    });

    // Today: a UPI dine-in bill, a voided bill and a parcel paid by card.
    await openDay();
    const upi = await billFor([{ variantId: r.paneer.half.id, quantity: 2 }], r.t2.id);
    await pay(upi.id, { mode: 'UPI', amount: upi.total }).expect(201);
    const voided = await billFor([{ variantId: r.roti.regular.id, quantity: 3 }], r.t1.id);
    await ctx
      .http()
      .post(`/api/bills/${voided.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Wrong table' })
      .expect(201);
    await ctx.http().post(`/api/orders/${voided.orderId}/cancel`).set(manager.auth).send({
      reason: 'Left',
    });
    const parcelId = await parcelOrder(ctx, cashier, [
      { variantId: r.roti.regular.id, quantity: 1 },
    ]);
    const parcel = (
      await ctx.http().post(`/api/orders/${parcelId}/bills`).set(cashier.auth).send({}).expect(201)
    ).body;
    await pay(parcel.id, { mode: 'CARD', amount: parcel.total }).expect(201);

    const res = await report(istDate(1), istDate(0)).expect(200);
    const total = first.total + upi.total + parcel.total;
    expect(res.body.range).toEqual({ from: istDate(1), to: istDate(0) });
    expect(res.body.days).toHaveLength(2);
    expect(res.body.days[0]).toMatchObject({
      date: istDate(1),
      status: 'CLOSED',
      bills: 1,
      total: first.total,
      cash: first.total,
      upi: 0,
      card: 0,
      expenses: 1000,
    });
    expect(res.body.days[1]).toMatchObject({ date: istDate(0), bills: 2, upi: upi.total });
    expect(res.body.summary).toMatchObject({
      bills: 3,
      total,
      averageBill: Math.round(total / 3),
      payments: { CASH: first.total, UPI: upi.total, CARD: parcel.total },
      expenses: { total: 1000, byCategory: [{ name: 'Gas', amount: 1000 }] },
      // Sales without the GST that is owed on to the government, minus expenses.
      net: total - res.body.summary.cgst - res.body.summary.sgst - 1000,
    });
    expect(res.body.summary.cgst).toBeGreaterThan(0);
    expect(res.body.summary.byType.DINE_IN).toEqual({ orders: 2, total: first.total + upi.total });
    expect(res.body.summary.byType.PARCEL).toEqual({ orders: 1, total: parcel.total });
    expect(res.body.items[0]).toMatchObject({ itemName: 'Paneer Tikka', quantity: 2 });
    const roti = res.body.items.find((i: { itemName: string }) => i.itemName === 'Tandoori Roti');
    expect(roti.quantity).toBe(2);
    expect(res.body.categories.length).toBeGreaterThan(0);
    expect(
      res.body.categories.reduce((n: number, c: { quantity: number }) => n + c.quantity, 0),
    ).toBe(4);

    const onlyToday = await report(istDate(0), istDate(0)).expect(200);
    expect(onlyToday.body.summary.bills).toBe(2);
  });

  it('splits taxable value by GST rate and keeps No-GST sales apart', async () => {
    const gst18 = await ctx.prisma.taxRate.create({
      data: { outletId: outlet.id, name: 'GST 18%', cgstBp: 900, sgstBp: 900 },
    });
    await ctx.prisma.item.updateMany({
      where: { name: 'Tandoori Roti' },
      data: { taxRateId: null },
    });
    await ctx.prisma.item.updateMany({
      where: { name: 'Paneer Tikka' },
      data: { taxRateId: gst18.id },
    });
    await openDay();
    // ₹30 roti (No GST) + ₹180 paneer at 18% + ₹120 dosa at 5%
    const bill = await billFor([
      { variantId: r.roti.regular.id, quantity: 1 },
      { variantId: r.paneer.half.id, quantity: 1 },
      { variantId: r.dosa.regular.id, quantity: 1, addonIds: [r.chutney.coconut.id] },
    ]);
    await pay(bill.id, { mode: 'CASH', amount: bill.total }).expect(201);

    const res = await report(istDate(0), istDate(0)).expect(200);
    expect(res.body.summary).toMatchObject({
      taxable: 30000,
      exempt: 3000,
      cgst: 1620 + 300,
      sgst: 1620 + 300,
      gstBreakup: [
        { ratePercent: 5, taxable: 12000, cgst: 300, sgst: 300 },
        { ratePercent: 18, taxable: 18000, cgst: 1620, sgst: 1620 },
      ],
    });
  });

  it('shows what was collected and what is still unpaid next to sales', async () => {
    await openDay();
    const paid = await billFor([{ variantId: r.paneer.half.id, quantity: 1 }]);
    await pay(paid.id, { mode: 'UPI', amount: paid.total }).expect(201);
    const part = await billFor([{ variantId: r.paneer.half.id, quantity: 2 }], r.t2.id);
    await pay(part.id, { mode: 'CASH', amount: 10000 }).expect(201);
    // A voided bill is neither sales nor unpaid.
    const voided = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }], r.t1.id);
    await ctx
      .http()
      .post(`/api/bills/${voided.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Wrong table' })
      .expect(201);

    const res = await report(istDate(0), istDate(0)).expect(200);
    const total = paid.total + part.total;
    expect(res.body.summary).toMatchObject({
      total,
      collected: paid.total + 10000,
      unpaid: part.total - 10000,
    });
    expect(res.body.days[0]).toMatchObject({
      total,
      collected: paid.total + 10000,
      unpaid: part.total - 10000,
    });
  });

  it('reports one business day by id, whatever date it was opened on', async () => {
    await openDay();
    const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
    await pay(bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
    // The day was opened yesterday evening and is still running.
    const day = await ctx.prisma.businessDay.findFirstOrThrow();
    await ctx.prisma.businessDay.update({
      where: { id: day.id },
      data: { openedAt: new Date(Date.now() - 86_400_000) },
    });

    const today = await report(istDate(0), istDate(0)).expect(200);
    expect(today.body.summary.bills).toBe(0);
    const byId = await ctx
      .http()
      .get(`/api/reports/sales?businessDayId=${day.id}`)
      .set(owner.auth)
      .expect(200);
    expect(byId.body.days).toHaveLength(1);
    expect(byId.body.days[0]).toMatchObject({ dayId: day.id, date: istDate(1), status: 'OPEN' });
    expect(byId.body.summary).toMatchObject({ bills: 1, total: bill.total });
    expect(byId.body.range).toEqual({ from: istDate(1), to: istDate(1) });

    await ctx
      .http()
      .get('/api/reports/sales?businessDayId=00000000-0000-4000-8000-000000000000')
      .set(owner.auth)
      .expect(404);
    await ctx.http().get('/api/reports/sales?businessDayId=nope').set(owner.auth).expect(400);
    await ctx
      .http()
      .get(`/api/reports/sales?businessDayId=${day.id}`)
      .set(manager.auth)
      .expect(403);
  });

  it('gives zeros for a range without business days', async () => {
    const res = await report('2020-01-01', '2020-01-31').expect(200);
    expect(res.body.days).toEqual([]);
    expect(res.body.items).toEqual([]);
    expect(res.body.summary).toMatchObject({
      bills: 0,
      total: 0,
      averageBill: 0,
      net: 0,
      payments: { CASH: 0, UPI: 0, CARD: 0 },
    });
  });

  it('counts a reopened day once', async () => {
    await openDay();
    const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
    await pay(bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
    await closeDay();
    const day = await ctx.prisma.businessDay.findFirstOrThrow();
    await ctx
      .http()
      .post(`/api/business-day/${day.id}/reopen`)
      .set(owner.auth)
      .send({ reason: 'Missed a bill' })
      .expect(201);
    await closeDay();
    const res = await report(istDate(0), istDate(0)).expect(200);
    expect(res.body.days).toHaveLength(1);
    expect(res.body.summary.bills).toBe(1);
  });

  it('keeps a renamed dish in one row, under its current name', async () => {
    await openDay();
    const before = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }], r.t1.id);
    await pay(before.id, { mode: 'CASH', amount: before.total }).expect(201);
    await ctx.prisma.item.updateMany({
      where: { name: 'Tandoori Roti' },
      data: { name: 'Tandoori Roti (Butter)' },
    });
    const after = await billFor([{ variantId: r.roti.regular.id, quantity: 2 }], r.t2.id);
    await pay(after.id, { mode: 'CASH', amount: after.total }).expect(201);

    const res = await report(istDate(0), istDate(0)).expect(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({ itemName: 'Tandoori Roti (Butter)', quantity: 3 }),
    ]);
    const day = await ctx.prisma.businessDay.findFirstOrThrow();
    const dayReport = await ctx
      .http()
      .get(`/api/business-day/${day.id}/report`)
      .set(manager.auth)
      .expect(200);
    expect(dayReport.body.topItems).toEqual([
      expect.objectContaining({ itemName: 'Tandoori Roti (Butter)', quantity: 3 }),
    ]);
  });

  it('keeps the name on the bill for a dish that has been archived', async () => {
    await openDay();
    const bill = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
    await pay(bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
    await ctx.prisma.item.updateMany({
      where: { name: 'Tandoori Roti' },
      data: { name: 'Roti (old)', archivedAt: new Date() },
    });
    const res = await report(istDate(0), istDate(0)).expect(200);
    expect(res.body.items).toEqual([expect.objectContaining({ itemName: 'Tandoori Roti' })]);
  });

  it('refuses a bad or too long range, and is for the owner only', async () => {
    const long = await report('2026-01-01', '2026-06-30').expect(400);
    expect(long.body.message).toMatch(/92 days/);
    await report('2026-10-02', '2026-10-01').expect(400);
    await ctx.http().get('/api/reports/sales').set(owner.auth).expect(400);
    await report(istDate(0), istDate(0), manager).expect(403);
  });
  it('adds totals beyond the 32-bit range (₹2.15 crore and up)', async () => {
    await openDay();
    const a = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }]);
    const b = await billFor([{ variantId: r.roti.regular.id, quantity: 1 }], r.t2.id);
    // Two large bills, as a long range of a busy restaurant would add up to.
    await ctx.prisma.bill.updateMany({ data: { total: 1_500_000_000 } });
    await ctx.prisma.billItem.updateMany({ data: { lineTotal: 1_500_000_000 } });
    const res = await report(istDate(0), istDate(0)).expect(200);
    expect(res.body.summary.total).toBe(3_000_000_000);
    expect(res.body.summary.byType.DINE_IN.total).toBe(3_000_000_000);
    expect(res.body.items[0].amount).toBe(3_000_000_000);
    expect(res.body.categories[0].amount).toBe(3_000_000_000);
    expect([a.id, b.id]).toHaveLength(2);
  });

  it('groups bills by the India hour they were made, leaving out void bills', async () => {
    await openDay();
    const roti = [{ variantId: r.roti.regular.id, quantity: 1 }];
    const a = await billFor(roti);
    const b = await billFor([{ variantId: r.roti.regular.id, quantity: 2 }], r.t2.id);
    const parcelBill = async () => {
      const orderId = await parcelOrder(ctx, waiter, roti);
      return (
        await ctx.http().post(`/api/orders/${orderId}/bills`).set(cashier.auth).send({}).expect(201)
      ).body as { id: string; total: number };
    };
    const c = await parcelBill();
    const voided = await parcelBill();
    const at = (hh: number, mm: number) =>
      new Date(
        `${istDate(0)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`,
      );
    await ctx.prisma.bill.update({ where: { id: a.id }, data: { createdAt: at(13, 10) } });
    await ctx.prisma.bill.update({ where: { id: b.id }, data: { createdAt: at(13, 50) } });
    await ctx.prisma.bill.update({ where: { id: c.id }, data: { createdAt: at(19, 5) } });
    await ctx.prisma.bill.update({
      where: { id: voided.id },
      data: { createdAt: at(13, 30), status: 'VOID' },
    });

    const res = await report(istDate(0), istDate(0)).expect(200);
    expect(res.body.hours).toEqual([
      { hour: 13, bills: 2, total: a.total + b.total },
      { hour: 19, bills: 1, total: c.total },
    ]);
    const empty = await report('2020-01-01', '2020-01-31').expect(200);
    expect(empty.body.hours).toEqual([]);
  });
});
