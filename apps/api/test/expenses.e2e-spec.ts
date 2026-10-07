import type { Outlet } from '@prisma/client';
import { billFor as billForOn, pay as payOn } from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('expenses', () => {
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
    cashier = await signIn(ctx, outlet.id, 'CASHIER', 'Ravi');
    waiter = await signIn(ctx, outlet.id, 'WAITER');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 100000 })
      .expect(201);
  });

  const categories = async (who = cashier) =>
    (await ctx.http().get('/api/expense-categories').set(who.auth).expect(200)).body as {
      id: string;
      name: string;
      isSystem: boolean;
    }[];
  const categoryId = async (name: string) => (await categories()).find((c) => c.name === name)!.id;
  const add = (body: object, who = cashier, key?: string) => {
    const req = ctx.http().post('/api/expenses').set(who.auth);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const today = async () =>
    (await ctx.http().get('/api/expenses?day=current').set(cashier.auth).expect(200)).body;

  it('starts with the default categories, Raw material locked', async () => {
    const list = await categories();
    expect(list.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Raw material', 'Gas', 'Salaries', 'Rent', 'Other']),
    );
    const raw = list.find((c) => c.name === 'Raw material')!;
    expect(raw.isSystem).toBe(true);
    const rename = await ctx
      .http()
      .put(`/api/expense-categories/${raw.id}`)
      .set(manager.auth)
      .send({ name: 'Groceries' })
      .expect(409);
    expect(rename.body.code).toBe('SYSTEM_CATEGORY');
    await ctx
      .http()
      .post(`/api/expense-categories/${raw.id}/archive`)
      .set(manager.auth)
      .expect(409);
    const added = await ctx
      .http()
      .post('/api/expense-categories')
      .set(manager.auth)
      .send({ name: 'Cleaning' })
      .expect(201);
    expect(added.body).toMatchObject({ name: 'Cleaning', isSystem: false });
    await ctx
      .http()
      .post('/api/expense-categories')
      .set(manager.auth)
      .send({ name: 'cleaning' })
      .expect(409);
  });

  it('records an expense on the open day with totals by mode and category', async () => {
    const gas = await categoryId('Gas');
    const rent = await categoryId('Rent');
    const res = await add({
      categoryId: gas,
      amount: 95000,
      mode: 'CASH',
      note: 'Cylinder',
    }).expect(201);
    expect(res.body).toMatchObject({
      amount: 95000,
      mode: 'CASH',
      note: 'Cylinder',
      source: 'MANUAL',
      category: { id: gas, name: 'Gas' },
      createdBy: { name: 'Ravi' },
      voidedAt: null,
    });
    await add({ categoryId: rent, amount: 500000, mode: 'UPI' }).expect(201);
    const list = await today();
    expect(list.expenses).toHaveLength(2);
    expect(list.totals).toEqual({
      total: 595000,
      cash: 95000,
      byMode: { CASH: 95000, UPI: 500000, CARD: 0 },
      byCategory: [
        { name: 'Rent', amount: 500000 },
        { name: 'Gas', amount: 95000 },
      ],
    });
  });

  it('lets cashiers and managers add expenses but not waiters', async () => {
    const gas = await categoryId('Gas');
    await add({ categoryId: gas, amount: 100, mode: 'CASH' }, manager).expect(201);
    await add({ categoryId: gas, amount: 100, mode: 'CASH' }, waiter).expect(403);
    await ctx.http().get('/api/expenses?day=current').set(waiter.auth).expect(403);
  });

  it('records a retried expense once', async () => {
    const gas = await categoryId('Gas');
    const body = { categoryId: gas, amount: 95000, mode: 'CASH' };
    const [a, b] = await Promise.all([
      add(body, cashier, 'exp-key-1'),
      add(body, cashier, 'exp-key-1'),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    const again = await add(body, cashier, 'exp-key-1').expect(201);
    expect(again.body.id).toBe(a.body.id);
    expect(await ctx.prisma.expense.count()).toBe(1);
  });

  it('refuses an unknown or archived category', async () => {
    const res = await add({
      categoryId: '11111111-1111-4111-8111-111111111111',
      amount: 100,
      mode: 'CASH',
    }).expect(400);
    expect(res.body.code).toBe('INVALID_REFERENCE');
    const gas = await categoryId('Gas');
    await ctx.http().post(`/api/expense-categories/${gas}/archive`).set(manager.auth).expect(201);
    await add({ categoryId: gas, amount: 100, mode: 'CASH' }).expect(400);
  });

  it('voids an expense with a reason while its day is open', async () => {
    const gas = await categoryId('Gas');
    const expense = (await add({ categoryId: gas, amount: 95000, mode: 'CASH' }).expect(201)).body;
    await ctx
      .http()
      .post(`/api/expenses/${expense.id}/void`)
      .set(cashier.auth)
      .send({ reason: '' })
      .expect(400);
    const voided = await ctx
      .http()
      .post(`/api/expenses/${expense.id}/void`)
      .set(cashier.auth)
      .send({ reason: 'Entered twice' })
      .expect(201);
    expect(voided.body).toMatchObject({ voidReason: 'Entered twice', voidedBy: { name: 'Ravi' } });
    expect(voided.body.voidedAt).not.toBeNull();
    expect((await today()).totals.total).toBe(0);
    await ctx
      .http()
      .post(`/api/expenses/${expense.id}/void`)
      .set(cashier.auth)
      .send({ reason: 'Again' })
      .expect(409);
    expect(await ctx.prisma.auditEntry.count({ where: { action: 'expense.void' } })).toBe(1);
  });

  it('subtracts cash expenses from the expected cash and lists them in the day report', async () => {
    const bill = await billForOn(ctx, r, waiter, cashier, [
      { variantId: r.roti.regular.id, quantity: 1 },
    ]);
    await payOn(ctx, cashier, bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
    const gasCash = (
      await add({ categoryId: await categoryId('Gas'), amount: 1000, mode: 'CASH' }).expect(201)
    ).body;
    await add({ categoryId: await categoryId('Rent'), amount: 5000, mode: 'UPI' }).expect(201);
    const voided = (
      await add({ categoryId: await categoryId('Gas'), amount: 700, mode: 'CASH' }).expect(201)
    ).body;
    await ctx
      .http()
      .post(`/api/expenses/${voided.id}/void`)
      .set(cashier.auth)
      .send({ reason: 'Mistake' })
      .expect(201);

    const check = await ctx
      .http()
      .get('/api/business-day/close-check')
      .set(manager.auth)
      .expect(200);
    expect(check.body.cash).toEqual({
      opening: 100000,
      cashSales: 3200,
      cashExpenses: 1000,
      expected: 102200,
    });
    const report = await ctx
      .http()
      .post('/api/business-day/close')
      .set(manager.auth)
      .send({ countedCash: 102200 })
      .expect(201);
    expect(report.body.cash).toMatchObject({ cashExpenses: 1000, expected: 102200, variance: 0 });
    expect(report.body.expenses).toEqual({
      total: 6000,
      cash: 1000,
      byCategory: [
        { name: 'Rent', amount: 5000 },
        { name: 'Gas', amount: 1000 },
      ],
    });

    const late = await add({ categoryId: await categoryId('Gas'), amount: 100, mode: 'CASH' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('DAY_NOT_OPEN');
    const lateVoid = await ctx
      .http()
      .post(`/api/expenses/${gasCash.id}/void`)
      .set(cashier.auth)
      .send({ reason: 'Too late' });
    expect(lateVoid.status).toBe(409);
    expect(lateVoid.body.code).toBe('DAY_CLOSED');
  });

  it('lists the expenses of an earlier day by id', async () => {
    await add({ categoryId: await categoryId('Gas'), amount: 1000, mode: 'CASH' }).expect(201);
    const dayId = (await ctx.prisma.businessDay.findFirstOrThrow()).id;
    await ctx
      .http()
      .post('/api/business-day/close')
      .set(manager.auth)
      .send({ countedCash: 99000 })
      .expect(201);
    const res = await ctx.http().get(`/api/expenses?day=${dayId}`).set(manager.auth).expect(200);
    expect(res.body.totals.total).toBe(1000);
    const current = await ctx.http().get('/api/expenses?day=current').set(manager.auth).expect(200);
    expect(current.body).toEqual({ day: null, expenses: [], totals: expect.any(Object) });
  });
});
