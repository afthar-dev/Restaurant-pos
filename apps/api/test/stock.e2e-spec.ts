import type { Outlet } from '@prisma/client';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('stock register and purchases', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let owner: SignedIn;
  let manager: SignedIn;
  let cashier: SignedIn;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    owner = await signIn(ctx, outlet.id, 'OWNER');
    manager = await signIn(ctx, outlet.id, 'MANAGER', 'Meena');
    cashier = await signIn(ctx, outlet.id, 'CASHIER');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 100000 })
      .expect(201);
  });

  const newItem = async (name: string, unit = 'kg', minLevelMilli = 0) =>
    (
      await ctx
        .http()
        .post('/api/stock/items')
        .set(manager.auth)
        .send({ name, unit, minLevelMilli })
        .expect(201)
    ).body as { id: string; name: string; currentMilli: number };
  const items = async () =>
    (await ctx.http().get('/api/stock/items').set(manager.auth).expect(200)).body as {
      id: string;
      name: string;
      currentMilli: number;
      low: boolean;
      lastPurchase: { rate: number } | null;
    }[];
  const item = async (id: string) => (await items()).find((i) => i.id === id)!;
  const purchase = (body: object, key?: string) => {
    const req = ctx.http().post('/api/purchases').set(manager.auth);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const adjust = (id: string, body: object) =>
    ctx.http().post(`/api/stock/items/${id}/adjust`).set(manager.auth).send(body);

  it('keeps one active item per name and lists low items first', async () => {
    const onion = await newItem('Onion', 'kg', 5000);
    await newItem('Atta', 'kg', 0);
    await ctx
      .http()
      .post('/api/stock/items')
      .set(manager.auth)
      .send({ name: 'onion', unit: 'kg', minLevelMilli: 0 })
      .expect(409);
    const list = await items();
    expect(list.map((i) => i.name)).toEqual(['Onion', 'Atta']);
    expect(list[0]).toMatchObject({ id: onion.id, low: true, currentMilli: 0 });
    expect(list[1]).toMatchObject({ low: false });
    await ctx
      .http()
      .put(`/api/stock/items/${onion.id}`)
      .set(manager.auth)
      .send({ name: 'Onion (red)', unit: 'kg', minLevelMilli: 0 })
      .expect(200);
    expect((await item(onion.id)).low).toBe(false);
  });

  it('records a purchase: stock up, one Raw material expense, cash out of the drawer', async () => {
    const onion = await newItem('Onion');
    const oil = await newItem('Oil', 'L');
    const res = await purchase({
      vendorName: 'Fresh Veg Traders',
      billRef: 'A-102',
      paidMode: 'CASH',
      lines: [
        { stockItemId: onion.id, qtyMilli: 10500, amount: 42000 },
        { stockItemId: oil.id, qtyMilli: 5000, amount: 75000 },
      ],
    }).expect(201);
    expect(res.body).toMatchObject({
      vendorName: 'Fresh Veg Traders',
      billRef: 'A-102',
      paidMode: 'CASH',
      total: 117000,
      createdBy: { name: 'Meena' },
      voidedAt: null,
    });
    expect(res.body.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemName: 'Onion', unit: 'kg', qtyMilli: 10500, amount: 42000 }),
      ]),
    );
    expect((await item(onion.id)).currentMilli).toBe(10500);
    // ₹420 for 10.5 kg = ₹40 per kg
    expect((await item(onion.id)).lastPurchase).toMatchObject({ rate: 4000 });

    const expense = await ctx.prisma.expense.findFirstOrThrow({ include: { category: true } });
    expect(expense).toMatchObject({
      amount: 117000,
      mode: 'CASH',
      source: 'PURCHASE',
      purchaseId: res.body.id,
      note: 'Purchase from Fresh Veg Traders #A-102',
    });
    expect(expense.category.name).toBe('Raw material');

    const check = await ctx
      .http()
      .get('/api/business-day/close-check')
      .set(manager.auth)
      .expect(200);
    expect(check.body.cash).toMatchObject({ cashExpenses: 117000, expected: -17000 });

    const voidExpense = await ctx
      .http()
      .post(`/api/expenses/${expense.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Wrong' })
      .expect(409);
    expect(voidExpense.body.code).toBe('VOID_THE_PURCHASE');
  });

  it('records a retried purchase once', async () => {
    const onion = await newItem('Onion');
    const body = {
      vendorName: 'Fresh Veg Traders',
      paidMode: 'UPI',
      lines: [{ stockItemId: onion.id, qtyMilli: 1000, amount: 4000 }],
    };
    const [a, b] = await Promise.all([purchase(body, 'p-1'), purchase(body, 'p-1')]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    expect((await purchase(body, 'p-1').expect(201)).body.id).toBe(a.body.id);
    expect(await ctx.prisma.purchase.count()).toBe(1);
    expect(await ctx.prisma.expense.count()).toBe(1);
    expect((await item(onion.id)).currentMilli).toBe(1000);
  });

  it('refuses unknown or archived items and purchases without an open day', async () => {
    const onion = await newItem('Onion');
    const bad = await purchase({
      vendorName: 'X',
      paidMode: 'CASH',
      lines: [{ stockItemId: '11111111-1111-4111-8111-111111111111', qtyMilli: 1, amount: 1 }],
    }).expect(400);
    expect(bad.body.code).toBe('ITEM_UNKNOWN');
    await ctx.http().post(`/api/stock/items/${onion.id}/archive`).set(manager.auth).expect(201);
    await purchase({
      vendorName: 'X',
      paidMode: 'CASH',
      lines: [{ stockItemId: onion.id, qtyMilli: 1, amount: 1 }],
    }).expect(400);

    const atta = await newItem('Atta');
    await ctx
      .http()
      .post('/api/business-day/close')
      .set(manager.auth)
      .send({ countedCash: 100000 })
      .expect(201);
    const closed = await purchase({
      vendorName: 'X',
      paidMode: 'CASH',
      lines: [{ stockItemId: atta.id, qtyMilli: 1, amount: 1 }],
    });
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe('DAY_NOT_OPEN');
  });

  it('refuses a quantity that the stock column cannot hold, and a count resets it', async () => {
    const flour = await newItem('Flour', 'g');
    await adjust(flour.id, { qtyMilli: 1_000_000_000, reason: 'Opening' }).expect(201);
    await adjust(flour.id, { qtyMilli: 1_000_000_000, reason: 'More' }).expect(201);
    expect((await item(flour.id)).currentMilli).toBe(2_000_000_000);

    const tooMuch = await adjust(flour.id, { qtyMilli: 1, reason: 'One more' }).expect(400);
    expect(tooMuch.body).toMatchObject({
      code: 'STOCK_TOO_LARGE',
      message: 'That quantity is too large. Count this item to reset its stock.',
    });
    const bought = await purchase({
      vendorName: 'Mill',
      paidMode: 'CASH',
      lines: [{ stockItemId: flour.id, qtyMilli: 25_000, amount: 5000 }],
    }).expect(400);
    expect(bought.body.code).toBe('STOCK_TOO_LARGE');
    expect(await ctx.prisma.purchase.count()).toBe(0);
    expect(await ctx.prisma.expense.count()).toBe(0);
    expect(await ctx.prisma.stockTxn.count()).toBe(2);
    expect((await item(flour.id)).currentMilli).toBe(2_000_000_000);

    // The other direction.
    const diesel = await newItem('Diesel', 'ml');
    await adjust(diesel.id, { qtyMilli: -1_000_000_000, reason: 'Loss' }).expect(201);
    await adjust(diesel.id, { qtyMilli: -1_000_000_000, reason: 'Loss' }).expect(201);
    const under = await adjust(diesel.id, { qtyMilli: -1, reason: 'Loss' }).expect(400);
    expect(under.body.code).toBe('STOCK_TOO_LARGE');

    const counted = await ctx
      .http()
      .post(`/api/stock/items/${flour.id}/count`)
      .set(manager.auth)
      .send({ countedMilli: 50_000 })
      .expect(201);
    expect(counted.body.item.currentMilli).toBe(50_000);
    await adjust(flour.id, { qtyMilli: 1, reason: 'Works again' }).expect(201);
  });

  it('posts a count as the difference, and nothing when it matches', async () => {
    const onion = await newItem('Onion');
    await adjust(onion.id, { qtyMilli: 5000, reason: 'Opening stock' }).expect(201);
    const counted = await ctx
      .http()
      .post(`/api/stock/items/${onion.id}/count`)
      .set(manager.auth)
      .send({ countedMilli: 4250, note: 'Evening count' })
      .expect(201);
    expect(counted.body).toMatchObject({ difference: -750, item: { currentMilli: 4250 } });
    const same = await ctx
      .http()
      .post(`/api/stock/items/${onion.id}/count`)
      .set(manager.auth)
      .send({ countedMilli: 4250 })
      .expect(201);
    expect(same.body.difference).toBe(0);
    const history = await ctx
      .http()
      .get(`/api/stock/items/${onion.id}/txns`)
      .set(manager.auth)
      .expect(200);
    expect(
      history.body.map((t: { type: string; qtyMilli: number }) => [t.type, t.qtyMilli]),
    ).toEqual([
      ['COUNT', -750],
      ['ADJUST', 5000],
    ]);
    expect(history.body[0]).toMatchObject({ note: 'Evening count', createdBy: { name: 'Meena' } });
    await adjust(onion.id, { qtyMilli: -100, reason: '' }).expect(400);
  });

  it('voids a purchase: stock back (even below zero) and its expense voided', async () => {
    const onion = await newItem('Onion');
    const bought = (
      await purchase({
        vendorName: 'Fresh Veg Traders',
        paidMode: 'CASH',
        lines: [{ stockItemId: onion.id, qtyMilli: 2000, amount: 8000 }],
      }).expect(201)
    ).body;
    await adjust(onion.id, { qtyMilli: -1500, reason: 'Used in kitchen' }).expect(201);
    const voided = await ctx
      .http()
      .post(`/api/purchases/${bought.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Returned to vendor' })
      .expect(201);
    expect(voided.body).toMatchObject({
      voidReason: 'Returned to vendor',
      voidedBy: { name: 'Meena' },
    });
    expect((await item(onion.id)).currentMilli).toBe(-1500);
    const expense = await ctx.prisma.expense.findFirstOrThrow();
    expect(expense.voidReason).toBe('Returned to vendor');
    expect(expense.voidedAt).not.toBeNull();
    await ctx
      .http()
      .post(`/api/purchases/${bought.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Again' })
      .expect(409);
    expect(await ctx.prisma.auditEntry.count({ where: { action: 'purchase.void' } })).toBe(1);
  });

  it("lists the day's purchases", async () => {
    const onion = await newItem('Onion');
    await purchase({
      vendorName: 'A',
      paidMode: 'CASH',
      lines: [{ stockItemId: onion.id, qtyMilli: 1000, amount: 4000 }],
    }).expect(201);
    const list = await ctx.http().get('/api/purchases?day=current').set(manager.auth).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].lines[0]).toMatchObject({ itemName: 'Onion', qtyMilli: 1000 });
  });

  it('keeps the stock exact under concurrent changes', async () => {
    const onion = await newItem('Onion');
    await Promise.all(
      Array.from({ length: 20 }, () => adjust(onion.id, { qtyMilli: 1000, reason: 'Delivery' })),
    );
    expect((await item(onion.id)).currentMilli).toBe(20000);
  });

  it('is for owners and managers only', async () => {
    await ctx.http().get('/api/stock/items').set(cashier.auth).expect(403);
    await ctx.http().get('/api/purchases').set(cashier.auth).expect(403);
  });
});
