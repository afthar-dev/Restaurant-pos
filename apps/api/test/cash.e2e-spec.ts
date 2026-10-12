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

describe('cash movements and petty cash', () => {
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

  const move = (body: object, who = cashier) =>
    ctx.http().post('/api/cash-movements').set(who.auth).send(body);
  const approval = (who = cashier) => overrideTokenOn(ctx, manager, who, 'day.openClose');
  const closeCheck = async () =>
    (await ctx.http().get('/api/business-day/close-check').set(manager.auth).expect(200)).body;
  const expectedNow = async () => (await closeCheck()).cash.expected as number;
  const roti = (): Line[] => [{ variantId: r.roti.regular.id, quantity: 1 }];

  describe('movements', () => {
    it('moves the expected cash the right way for each type', async () => {
      expect(await expectedNow()).toBe(100000);
      await move({ type: 'PAY_IN', amount: 50000, reasonCode: 'FLOAT_TOP_UP' }, manager).expect(
        201,
      );
      expect(await expectedNow()).toBe(150000);
      await move({ type: 'PAY_OUT', amount: 20000, reasonCode: 'SUPPLIER' }, manager).expect(201);
      expect(await expectedNow()).toBe(130000);
      const drop = await move({ type: 'DROP', amount: 30000, reasonCode: 'SAFE' }, manager).expect(
        201,
      );
      expect(drop.body).toMatchObject({ type: 'DROP', amount: 30000, reasonCode: 'SAFE' });
      expect(await expectedNow()).toBe(100000);
      const cash = (await closeCheck()).cash;
      expect(cash).toMatchObject({ payIns: 50000, payOuts: 20000, drops: 30000 });
    });

    it('lets a cashier pay in, but needs a manager for a pay-out or a drop', async () => {
      await move({ type: 'PAY_IN', amount: 10000, reasonCode: 'FLOAT_TOP_UP' }).expect(201);

      const refused = await move({ type: 'PAY_OUT', amount: 5000, reasonCode: 'SUPPLIER' }).expect(
        403,
      );
      expect(refused.body.code).toBe('APPROVAL_REQUIRED');
      const badToken = await move({
        type: 'DROP',
        amount: 5000,
        reasonCode: 'BANK',
        overrideToken: 'not-a-token',
      }).expect(403);
      expect(badToken.body.code).toBe('APPROVAL_REQUIRED');
      expect(await expectedNow()).toBe(110000);

      const ok = await move({
        type: 'PAY_OUT',
        amount: 5000,
        reasonCode: 'SUPPLIER',
        overrideToken: await approval(),
      }).expect(201);
      expect(ok.body.approvedBy).toMatchObject({ id: manager.user.id });
      expect(ok.body.createdBy).toMatchObject({ id: cashier.user.id });
      expect(await expectedNow()).toBe(105000);

      // The token is single-use.
      const token = await approval();
      await move({
        type: 'DROP',
        amount: 1000,
        reasonCode: 'SAFE',
        overrideToken: token,
      }).expect(201);
      await move({
        type: 'DROP',
        amount: 1000,
        reasonCode: 'SAFE',
        overrideToken: token,
      }).expect(403);
    });

    it('keeps a waiter out, and checks the reason and the amount', async () => {
      await move({ type: 'PAY_IN', amount: 100, reasonCode: 'FLOAT_TOP_UP' }, waiter).expect(403);
      await move({ type: 'PAY_IN', amount: 0, reasonCode: 'FLOAT_TOP_UP' }).expect(400);
      await move({ type: 'PAY_IN', amount: 100, reasonCode: 'SUPPLIER' }).expect(400);
      await move({ type: 'PAY_OUT', amount: 100, reasonCode: 'OTHER' }, manager).expect(400);
      await move(
        { type: 'PAY_OUT', amount: 100, reasonCode: 'OTHER', note: 'Gas refill' },
        manager,
      ).expect(201);
    });

    it('needs an open day', async () => {
      await ctx
        .http()
        .post('/api/business-day/close')
        .set(manager.auth)
        .send({ countedCash: 100000 })
        .expect(201);
      const res = await move({ type: 'PAY_IN', amount: 100, reasonCode: 'FLOAT_TOP_UP' }).expect(
        409,
      );
      expect(res.body.code).toBe('DAY_NOT_OPEN');
    });

    it('writes each movement to the audit log', async () => {
      await move({ type: 'PAY_IN', amount: 100, reasonCode: 'FLOAT_TOP_UP' }).expect(201);
      await move(
        {
          type: 'PAY_OUT',
          amount: 200,
          reasonCode: 'STAFF_ADVANCE',
          overrideToken: await approval(),
        },
        cashier,
      ).expect(201);
      await move({ type: 'DROP', amount: 300, reasonCode: 'BANK' }, manager).expect(201);
      const actions = await ctx.prisma.auditEntry.findMany({
        where: { action: { startsWith: 'cash.' } },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((a) => a.action)).toEqual(['cash.pay_in', 'cash.pay_out', 'cash.drop']);
      expect(actions[1]).toMatchObject({ actorId: cashier.user.id, entity: 'cash_movement' });
      expect(actions[1]!.after).toMatchObject({
        amount: 200,
        reasonCode: 'STAFF_ADVANCE',
        approvedBy: manager.user.id,
      });
    });

    it('lists a day, newest first, to anyone who can take cash', async () => {
      await move({ type: 'PAY_IN', amount: 100, reasonCode: 'FLOAT_TOP_UP' }).expect(201);
      await move({ type: 'DROP', amount: 300, reasonCode: 'BANK' }, manager).expect(201);
      const day = await ctx.prisma.businessDay.findFirstOrThrow();
      const res = await ctx
        .http()
        .get(`/api/cash-movements?businessDayId=${day.id}`)
        .set(cashier.auth)
        .expect(200);
      expect(res.body.map((m: { type: string }) => m.type)).toEqual(['DROP', 'PAY_IN']);
      expect(res.body[0]).toMatchObject({ createdBy: { name: 'Meena' }, amount: 300 });
      await ctx.http().get('/api/cash-movements').set(waiter.auth).expect(403);
    });
  });

  describe('one expected-cash formula', () => {
    it('gives the same figure on the close check, the day report and the close', async () => {
      const keep = await billForOn(ctx, r, waiter, cashier, roti());
      await payOn(ctx, cashier, keep.id, { mode: 'CASH', amount: keep.total }).expect(201);
      const refunded = await billForOn(ctx, r, waiter, cashier, roti(), r.t2.id);
      await payOn(ctx, cashier, refunded.id, { mode: 'CASH', amount: refunded.total }).expect(201);
      await ctx
        .http()
        .post(`/api/bills/${refunded.id}/void`)
        .set(manager.auth)
        .send({ reason: 'Wrong table' })
        .expect(201);
      // The order opens again; bill it once more and settle by UPI so the day can close.
      const again = (
        await ctx
          .http()
          .post(`/api/orders/${refunded.orderId}/bills`)
          .set(cashier.auth)
          .send({})
          .expect(201)
      ).body;
      await payOn(ctx, cashier, again.id, { mode: 'UPI', amount: again.total }).expect(201);
      const gas = (
        await ctx.http().get('/api/expense-categories').set(cashier.auth).expect(200)
      ).body.find((c: { name: string }) => c.name === 'Gas').id;
      await ctx
        .http()
        .post('/api/expenses')
        .set(cashier.auth)
        .send({ categoryId: gas, amount: 15000, mode: 'CASH' })
        .expect(201);
      await move({ type: 'PAY_IN', amount: 50000, reasonCode: 'FLOAT_TOP_UP' }).expect(201);
      await move({ type: 'PAY_OUT', amount: 20000, reasonCode: 'SUPPLIER' }, manager).expect(201);
      await move({ type: 'DROP', amount: 30000, reasonCode: 'SAFE' }, manager).expect(201);

      // The refunded sale nets out (cash in, then cash back).
      const formula = 100000 + keep.total - 15000 + 50000 - 20000 - 30000;

      const check = await closeCheck();
      expect(check.cash.expected).toBe(formula);

      const day = await ctx.prisma.businessDay.findFirstOrThrow();
      const open = (
        await ctx.http().get(`/api/business-day/${day.id}/report`).set(manager.auth).expect(200)
      ).body;
      expect(open.cash.expected).toBe(formula);
      expect(open.cash).toMatchObject({ payIns: 50000, payOuts: 20000, drops: 30000 });
      expect(open.cashMovements.totals).toEqual({ payIn: 50000, payOut: 20000, drop: 30000 });
      expect(open.cashMovements.list).toHaveLength(3);

      // The counted figure matches, so the stored expected value is the same everywhere.
      const counted = await ctx
        .http()
        .post(`/api/business-day/${day.id}/close/check-count`)
        .set(manager.auth)
        .send({ countedCash: formula })
        .expect(201);
      expect(counted.body).toMatchObject({ expected: formula, variance: 0 });
      const closed = await ctx
        .http()
        .post('/api/business-day/close')
        .set(manager.auth)
        .send({ countedCash: formula })
        .expect(201);
      expect(closed.body.cash.expected).toBe(formula);
      expect((await ctx.prisma.businessDay.findFirstOrThrow()).expectedCash).toBe(formula);
    });

    it('hides the cash movements from the blind close check', async () => {
      await move({ type: 'PAY_IN', amount: 50000, reasonCode: 'FLOAT_TOP_UP' }).expect(201);
      const blind = await ctx
        .http()
        .get('/api/business-day/close-check?blind=1')
        .set(manager.auth)
        .expect(200);
      expect(blind.body.cash).toEqual({});
    });
  });

  describe('petty cash limit', () => {
    let gas: string;
    beforeEach(async () => {
      gas = (
        await ctx.http().get('/api/expense-categories').set(cashier.auth).expect(200)
      ).body.find((c: { name: string }) => c.name === 'Gas').id;
    });
    const expense = (body: object, who = cashier) =>
      ctx.http().post('/api/expenses').set(who.auth).send(body);

    it('needs a manager token for a cash expense above the limit', async () => {
      const refused = await expense({ categoryId: gas, amount: 250000, mode: 'CASH' }).expect(403);
      expect(refused.body.code).toBe('APPROVAL_REQUIRED');
      const ok = await expense({
        categoryId: gas,
        amount: 250000,
        mode: 'CASH',
        overrideToken: await approval(),
      }).expect(201);
      expect(ok.body.amount).toBe(250000);
      expect(await ctx.prisma.expense.count()).toBe(1);
      await expense({ categoryId: gas, amount: 150000, mode: 'CASH' }).expect(201);
    });

    it('ignores the limit for a manager, and for a UPI expense', async () => {
      await expense({ categoryId: gas, amount: 250000, mode: 'CASH' }, manager).expect(201);
      await expense({ categoryId: gas, amount: 250000, mode: 'UPI' }).expect(201);
    });

    it('follows the outlet setting', async () => {
      const before = await ctx.http().get('/api/outlet').set(owner.auth).expect(200);
      expect(before.body.pettyCashLimitPaise).toBe(200000);
      await ctx
        .http()
        .patch('/api/outlet')
        .set(owner.auth)
        .send({ pettyCashLimitPaise: 50000 })
        .expect(200);
      await expense({ categoryId: gas, amount: 60000, mode: 'CASH' }).expect(403);
      await expense({ categoryId: gas, amount: 40000, mode: 'CASH' }).expect(201);
    });

    it('audits an expense being created and voided', async () => {
      const added = await expense({
        categoryId: gas,
        amount: 250000,
        mode: 'CASH',
        overrideToken: await approval(),
      }).expect(201);
      await ctx
        .http()
        .post(`/api/expenses/${added.body.id}/void`)
        .set(manager.auth)
        .send({ reason: 'Typo' })
        .expect(201);
      const created = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'expense.create' },
      });
      expect(created).toMatchObject({ actorId: cashier.user.id, entityId: added.body.id });
      expect(created.after).toMatchObject({ amount: 250000, approvedBy: manager.user.id });
      expect(await ctx.prisma.auditEntry.count({ where: { action: 'expense.void' } })).toBe(1);
    });
  });

  describe('accountability', () => {
    it('counts pay-outs and drops by who made them', async () => {
      await move({ type: 'PAY_IN', amount: 9999, reasonCode: 'FLOAT_TOP_UP' }).expect(201);
      await move(
        {
          type: 'PAY_OUT',
          amount: 20000,
          reasonCode: 'SUPPLIER',
          overrideToken: await approval(),
        },
        cashier,
      ).expect(201);
      await move({ type: 'DROP', amount: 30000, reasonCode: 'SAFE' }, manager).expect(201);
      await move({ type: 'PAY_OUT', amount: 5000, reasonCode: 'SUPPLIER' }, manager).expect(201);
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const res = await ctx
        .http()
        .get(`/api/reports/accountability?from=${day}&to=${day}`)
        .set(owner.auth)
        .expect(200);
      const byName = Object.fromEntries(
        res.body.byStaff.map((s: { name: string; cashOut: object }) => [s.name, s.cashOut]),
      );
      expect(byName['Kavya']).toEqual({ count: 1, amount: 20000 });
      expect(byName['Meena']).toEqual({ count: 2, amount: 35000 });
    });
  });
});
