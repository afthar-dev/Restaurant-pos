import type { Outlet, User } from '@prisma/client';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  resetDatabase,
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
