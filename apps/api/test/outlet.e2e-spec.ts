import type { Outlet, User } from '@prisma/client';
import { pay, servedOrder } from './billing-helpers';
import { buildRestaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  resetDatabase,
  signIn,
  type TestContext,
} from './helpers';

describe('outlet settings and audit', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let owner: User;
  let ownerToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    owner = await createUser(ctx.prisma, outlet.id, { role: 'OWNER', password: 'owner-pass-1' });
    ownerToken = (await loginWithPassword(ctx, owner.phone, 'owner-pass-1')).accessToken;
  });

  it('returns settings to any signed-in user', async () => {
    const waiter = await createUser(ctx.prisma, outlet.id, {
      role: 'MANAGER',
      password: 'mgr-pass-11',
    });
    const { accessToken } = await loginWithPassword(ctx, waiter.phone, 'mgr-pass-11');
    const res = await ctx
      .http()
      .get('/api/outlet')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body).toMatchObject({
      id: outlet.id,
      name: 'Test Outlet',
      taxScheme: 'REGULAR',
      cashierDiscountCapBp: 1000,
      waiterCanCollectPayment: false,
      parcelPaymentTiming: 'PAY_FIRST',
    });
  });

  it('lets the owner update settings and records before/after', async () => {
    const res = await ctx
      .http()
      .patch('/api/outlet')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cashierDiscountCapBp: 1500, gstin: '29ABCDE1234F1Z5' })
      .expect(200);
    expect(res.body.cashierDiscountCapBp).toBe(1500);
    expect(res.body.gstin).toBe('29ABCDE1234F1Z5');

    const audit = await ctx
      .http()
      .get('/api/audit?limit=5')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(audit.body[0]).toMatchObject({
      action: 'outlet.update',
      before: { cashierDiscountCapBp: 1000, gstin: null },
      after: { cashierDiscountCapBp: 1500, gstin: '29ABCDE1234F1Z5' },
    });
  });

  it('turning on waiter payments changes waiter permissions', async () => {
    await ctx
      .http()
      .patch('/api/outlet')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ waiterCanCollectPayment: true })
      .expect(200);
    const me = await ctx
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(me.body.permissions).toContain('payment.take');
  });

  it('stores the bill packaging charge', async () => {
    await ctx
      .http()
      .patch('/api/outlet')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ billPackagingCharge: 1000 })
      .expect(200);
    const res = await ctx
      .http()
      .get('/api/outlet')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.billPackagingCharge).toBe(1000);
  });

  it('forbids a manager from changing settings', async () => {
    const manager = await createUser(ctx.prisma, outlet.id, {
      role: 'MANAGER',
      password: 'manager-pass-1',
    });
    const { accessToken } = await loginWithPassword(ctx, manager.phone, 'manager-pass-1');
    await ctx
      .http()
      .patch('/api/outlet')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cashierDiscountCapBp: 10000 })
      .expect(403);
    await ctx.http().get('/api/audit').set('Authorization', `Bearer ${accessToken}`).expect(403);
  });

  it('rejects an invalid GSTIN', async () => {
    const res = await ctx
      .http()
      .patch('/api/outlet')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ gstin: 'not-a-gstin' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.details[0].path).toBe('gstin');
  });

  describe('GST scheme needs a GSTIN', () => {
    const patch = (body: object) =>
      ctx.http().patch('/api/outlet').set('Authorization', `Bearer ${ownerToken}`).send(body);

    it.each(['REGULAR', 'COMPOSITION'])('refuses %s without a GSTIN', async (taxScheme) => {
      const res = await patch({ taxScheme }).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.message).toBe('Add your GSTIN to charge GST.');
    });

    it('accepts a GST scheme together with a valid GSTIN', async () => {
      const res = await patch({ taxScheme: 'COMPOSITION', gstin: '27aapfu0939f1zv' }).expect(200);
      expect(res.body).toMatchObject({ taxScheme: 'COMPOSITION', gstin: '27AAPFU0939F1ZV' });
    });

    it('accepts a GST scheme when a GSTIN is already stored', async () => {
      await ctx.prisma.outlet.update({
        where: { id: outlet.id },
        data: { taxScheme: 'NONE', gstin: '27AAPFU0939F1ZV' },
      });
      await patch({ taxScheme: 'REGULAR' }).expect(200);
    });

    it('refuses clearing the GSTIN while on a GST scheme', async () => {
      await patch({ taxScheme: 'REGULAR', gstin: '27AAPFU0939F1ZV' }).expect(200);
      const res = await patch({ gstin: null }).expect(400);
      expect(res.body.message).toBe('Add your GSTIN to charge GST.');
    });

    it('lets NONE be saved and keeps the stored GSTIN', async () => {
      await patch({ taxScheme: 'REGULAR', gstin: '27AAPFU0939F1ZV' }).expect(200);
      const res = await patch({ taxScheme: 'NONE' }).expect(200);
      expect(res.body).toMatchObject({ taxScheme: 'NONE', gstin: '27AAPFU0939F1ZV' });
    });

    it('billing still works for a REGULAR outlet without a GSTIN, and settings refuses to save REGULAR without one', async () => {
      // A live outlet from before this rule: REGULAR, no GSTIN.
      await ctx.prisma.outlet.update({
        where: { id: outlet.id },
        data: { taxScheme: 'REGULAR', gstin: null },
      });
      const r = await buildRestaurant(ctx.prisma, outlet.id);
      const cashier = await signIn(ctx, outlet.id, 'CASHIER', 'Kavya');
      const waiter = await signIn(ctx, outlet.id, 'WAITER', 'Arun');
      await ctx
        .http()
        .post('/api/business-day/open')
        .set({ Authorization: `Bearer ${ownerToken}` })
        .send({ openingCash: 100000 })
        .expect(201);
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const bill = await ctx
        .http()
        .post(`/api/orders/${orderId}/bills`)
        .set(cashier.auth)
        .send({})
        .expect(201);
      await pay(ctx, cashier, bill.body.id, { mode: 'CASH', amount: bill.body.due }).expect(201);

      // Other settings still save.
      await patch({ billFooter: 'Thanks' }).expect(200);
      // Keeping or choosing a GST scheme without a GSTIN is what is refused.
      await patch({ taxScheme: 'REGULAR' }).expect(400);
      await patch({ gstin: null }).expect(400);
    });
  });

  it('rejects a bad audit query', async () => {
    await ctx
      .http()
      .get('/api/audit?limit=5000')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });
});

describe('login throttling', () => {
  let ctx: TestContext;
  const previous = process.env.AUTH_THROTTLE_LIMIT;

  beforeAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = '3';
    ctx = await createTestApp();
  });

  afterAll(async () => {
    process.env.AUTH_THROTTLE_LIMIT = previous;
    await ctx.app.close();
  });

  it('answers 429 once the per-minute login limit is used up', async () => {
    const attempt = () =>
      ctx.http().post('/api/auth/login').send({ phone: '9000000000', password: 'whatever-1' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});
