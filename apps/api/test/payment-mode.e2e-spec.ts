import type { Outlet } from '@prisma/client';
import {
  billFor as billForOn,
  overrideToken as overrideTokenOn,
  pay as payOn,
  type Line,
} from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

function istDate(at = new Date()): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

describe('payment mode correction, UPI settings and references', () => {
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
    waiter = await signIn(ctx, outlet.id, 'WAITER');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 100000 })
      .expect(201);
  });

  const roti = (): Line[] => [{ variantId: r.roti.regular.id, quantity: 1 }];
  const change = (paymentId: string, body: object, who = cashier) =>
    ctx.http().post(`/api/payments/${paymentId}/change-mode`).set(who.auth).send(body);
  const approval = (who = cashier) => overrideTokenOn(ctx, manager, who, 'day.openClose');
  const expectedNow = async () =>
    (await ctx.http().get('/api/business-day/close-check').set(manager.auth).expect(200)).body.cash
      .expected as number;
  const paidBill = async (mode: 'CASH' | 'UPI' | 'CARD', tableId = r.t1.id) => {
    const bill = await billForOn(ctx, r, waiter, cashier, roti(), tableId);
    const res = await payOn(ctx, cashier, bill.id, { mode, amount: bill.total }).expect(201);
    return { bill, payment: res.body.payments[0] as { id: string } };
  };

  describe('change mode', () => {
    it('moves expected cash down when a cash payment becomes UPI, and audits it', async () => {
      const { bill, payment } = await paidBill('CASH');
      expect(await expectedNow()).toBe(100000 + bill.total);

      const res = await change(payment.id, {
        mode: 'UPI',
        reasonCode: 'WRONG_MODE',
        overrideToken: await approval(),
      }).expect(201);
      expect(res.body.payments[0]).toMatchObject({ id: payment.id, mode: 'UPI' });
      expect(await expectedNow()).toBe(100000);

      const row = await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(row).toMatchObject({ mode: 'UPI', modeChangedFrom: 'CASH' });
      // The cash handed over no longer applies.
      expect(row.tendered).toBeNull();
      expect(row.change).toBeNull();

      const entry = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'payment.mode_change' },
      });
      expect(entry).toMatchObject({ actorId: cashier.user.id, entityId: payment.id });
      expect(entry.after).toMatchObject({
        from: 'CASH',
        to: 'UPI',
        reasonCode: 'WRONG_MODE',
        approvedBy: manager.user.id,
      });
    });

    it('moves expected cash back up when UPI becomes cash', async () => {
      const { bill, payment } = await paidBill('UPI');
      expect(await expectedNow()).toBe(100000);
      await change(payment.id, { mode: 'CASH', reasonCode: 'WRONG_MODE' }, manager).expect(201);
      expect(await expectedNow()).toBe(100000 + bill.total);
    });

    it('lets someone who can close the day change it without a token', async () => {
      const { payment } = await paidBill('CASH');
      await change(payment.id, { mode: 'CARD', reasonCode: 'WRONG_MODE' }, owner).expect(201);
    });

    it('asks a cashier for a manager, and a used token does not work twice', async () => {
      const { payment } = await paidBill('CASH');
      const none = await change(payment.id, { mode: 'UPI', reasonCode: 'WRONG_MODE' }).expect(403);
      expect(none.body.code).toBe('APPROVAL_REQUIRED');
      const token = await approval();
      await change(payment.id, {
        mode: 'UPI',
        reasonCode: 'WRONG_MODE',
        overrideToken: token,
      }).expect(201);
      const again = await change(payment.id, {
        mode: 'CARD',
        reasonCode: 'WRONG_MODE',
        overrideToken: token,
      }).expect(403);
      expect(again.body.code).toBe('APPROVAL_REQUIRED');
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).mode).toBe(
        'UPI',
      );
    });

    it('keeps a waiter out and checks the body', async () => {
      const { payment } = await paidBill('CASH');
      await change(payment.id, { mode: 'UPI', reasonCode: 'WRONG_MODE' }, waiter).expect(403);
      await change(payment.id, { mode: 'UPI' }, manager).expect(400);
      await change(payment.id, { mode: 'UPI', reasonCode: 'OTHER' }, manager).expect(400);
      await change(payment.id, { mode: 'CHEQUE', reasonCode: 'WRONG_MODE' }, manager).expect(400);
      const same = await change(payment.id, { mode: 'CASH', reasonCode: 'WRONG_MODE' }, manager);
      expect(same.status).toBe(400);
      await ctx
        .http()
        .post('/api/payments/00000000-0000-4000-8000-000000000000/change-mode')
        .set(manager.auth)
        .send({ mode: 'UPI', reasonCode: 'WRONG_MODE' })
        .expect(404);
    });

    it('refuses to change a payment mode once its day is closed', async () => {
      const { payment } = await paidBill('CASH');
      const expected = await expectedNow();
      await ctx
        .http()
        .post('/api/business-day/close')
        .set(manager.auth)
        .send({ countedCash: expected })
        .expect(201);
      // A new day is open, but the payment belongs to the closed one.
      await ctx
        .http()
        .post('/api/business-day/open')
        .set(owner.auth)
        .send({ openingCash: 0 })
        .expect(201);
      const res = await change(payment.id, { mode: 'UPI', reasonCode: 'WRONG_MODE' }, manager);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DAY_CLOSED');
      // And with no day open at all.
      const day = await ctx.prisma.businessDay.findFirstOrThrow({ where: { status: 'OPEN' } });
      await ctx
        .http()
        .post('/api/business-day/close')
        .set(manager.auth)
        .send({ countedCash: day.openingCash })
        .expect(201);
      const none = await change(payment.id, { mode: 'UPI', reasonCode: 'WRONG_MODE' }, manager);
      expect(none.status).toBe(409);
      expect(none.body.code).toBe('DAY_CLOSED');
      expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).mode).toBe(
        'CASH',
      );
    });

    it('refuses to change a refunded payment', async () => {
      const { bill, payment } = await paidBill('CASH');
      await ctx
        .http()
        .post(`/api/bills/${bill.id}/void`)
        .set(manager.auth)
        .send({ reasonCode: 'WRONG_ORDER' })
        .expect(201);
      const res = await change(payment.id, { mode: 'UPI', reasonCode: 'WRONG_MODE' }, manager);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REFUNDED');
    });

    it('counts changes by the person who made them, in the accountability report', async () => {
      const a = await paidBill('CASH');
      const b = await paidBill('CASH', r.t2.id);
      await change(a.payment.id, {
        mode: 'UPI',
        reasonCode: 'WRONG_MODE',
        overrideToken: await approval(),
      }).expect(201);
      await change(b.payment.id, { mode: 'CARD', reasonCode: 'WRONG_MODE' }, manager).expect(201);
      const day = istDate();
      const res = await ctx
        .http()
        .get(`/api/reports/accountability?from=${day}&to=${day}`)
        .set(owner.auth)
        .expect(200);
      const by = (id: string) => res.body.byStaff.find((s: { userId: string }) => s.userId === id);
      // Counted under whoever asked for the change, not the approving manager.
      expect(by(cashier.user.id).modeChanges).toBe(1);
      expect(by(manager.user.id).modeChanges).toBe(1);
    });
  });

  describe('references', () => {
    it('stores a UPI reference, refuses a bad one, and the day report reconciles', async () => {
      const withRef = await billForOn(ctx, r, waiter, cashier, roti());
      await payOn(ctx, cashier, withRef.id, {
        mode: 'UPI',
        amount: withRef.total,
        reference: 'ab12cd34',
      }).expect(201);
      expect(
        (await ctx.prisma.payment.findFirstOrThrow({ where: { billId: withRef.id } })).reference,
      ).toBe('ab12cd34');

      const bad = await billForOn(ctx, r, waiter, cashier, roti(), r.t2.id);
      for (const reference of ['abc', 'ab 12 cd', 'ab-12-cd', 'x'.repeat(23)]) {
        await payOn(ctx, cashier, bad.id, { mode: 'UPI', amount: bad.total, reference }).expect(
          400,
        );
      }
      // Blank is fine: no reference.
      const half = Math.floor(bad.total / 2);
      await payOn(ctx, cashier, bad.id, { mode: 'UPI', amount: half, reference: '' }).expect(201);
      await payOn(ctx, cashier, bad.id, { mode: 'CARD', amount: bad.total - half }).expect(201);

      const day = await ctx.prisma.businessDay.findFirstOrThrow();
      const report = (
        await ctx.http().get(`/api/business-day/${day.id}/report`).set(manager.auth).expect(200)
      ).body;
      expect(report.reconciliation.upi).toEqual({
        withRef: 1,
        withoutRef: 1,
        amountWithout: half,
      });
      expect(report.reconciliation.card).toEqual({
        withRef: 0,
        withoutRef: 1,
        amountWithout: bad.total - half,
      });
      expect(report.reconciliation.missing).toEqual([
        expect.objectContaining({ billNo: bad.billNo, mode: 'UPI', amount: half }),
        expect.objectContaining({ billNo: bad.billNo, mode: 'CARD', amount: bad.total - half }),
      ]);
    });

    it('leaves refunded payments out of the reconciliation', async () => {
      const { bill } = await paidBill('UPI');
      await ctx
        .http()
        .post(`/api/bills/${bill.id}/void`)
        .set(manager.auth)
        .send({ reasonCode: 'WRONG_ORDER' })
        .expect(201);
      const day = await ctx.prisma.businessDay.findFirstOrThrow();
      const report = (
        await ctx.http().get(`/api/business-day/${day.id}/report`).set(manager.auth).expect(200)
      ).body;
      expect(report.reconciliation.upi).toEqual({ withRef: 0, withoutRef: 0, amountWithout: 0 });
      expect(report.reconciliation.missing).toEqual([]);
    });
  });

  describe('UPI settings', () => {
    it('saves and clears the UPI ID, payee and print flag', async () => {
      const get = async () =>
        (await ctx.http().get('/api/outlet').set(owner.auth).expect(200)).body;
      expect(await get()).toMatchObject({ upiVpa: null, upiPayee: null, printUpiQr: true });
      await ctx
        .http()
        .patch('/api/outlet')
        .set(owner.auth)
        .send({ upiVpa: 'spicegarden@okicici', upiPayee: 'Spice Garden', printUpiQr: false })
        .expect(200);
      expect(await get()).toMatchObject({
        upiVpa: 'spicegarden@okicici',
        upiPayee: 'Spice Garden',
        printUpiQr: false,
      });
      await ctx.http().patch('/api/outlet').set(owner.auth).send({ upiVpa: 'nope' }).expect(400);
      await ctx.http().patch('/api/outlet').set(owner.auth).send({ upiVpa: '' }).expect(200);
      expect((await get()).upiVpa).toBeNull();
    });
  });
});
