import type { Outlet } from '@prisma/client';
import { CountersService } from '../src/business-day/counters.service';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('business day', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let manager: SignedIn;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    manager = await signIn(ctx, outlet.id, 'MANAGER', 'Meera');
  });

  it('has no current day until a manager opens one', async () => {
    const before = await ctx.http().get('/api/business-day/current').set(manager.auth).expect(200);
    expect(before.body).toEqual({ day: null });

    const opened = await ctx
      .http()
      .post('/api/business-day/open')
      .set(manager.auth)
      .send({ openingCash: 200000 })
      .expect(201);
    expect(opened.body).toMatchObject({ openingCash: 200000, openedBy: { name: 'Meera' } });

    const current = await ctx.http().get('/api/business-day/current').set(manager.auth).expect(200);
    expect(current.body.day.id).toBe(opened.body.id);
  });

  it('refuses a second open day', async () => {
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(manager.auth)
      .send({ openingCash: 0 })
      .expect(201);
    const res = await ctx
      .http()
      .post('/api/business-day/open')
      .set(manager.auth)
      .send({ openingCash: 0 })
      .expect(409);
    expect(res.body.code).toBe('DAY_ALREADY_OPEN');
  });

  it('opens exactly one day when five requests race', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ctx.http().post('/api/business-day/open').set(manager.auth).send({ openingCash: 0 }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await ctx.prisma.businessDay.count()).toBe(1);
  });

  it('does not let a cashier open the day', async () => {
    const cashier = await signIn(ctx, outlet.id, 'CASHIER');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(cashier.auth)
      .send({ openingCash: 0 })
      .expect(403);
  });

  it('records the opening in the audit log', async () => {
    await ctx.http().post('/api/business-day/open').set(manager.auth).send({ openingCash: 5000 });
    expect(await ctx.prisma.auditEntry.count({ where: { action: 'day.open' } })).toBe(1);
  });
});

describe('counters', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('hands out gap-free, unique numbers under concurrency', async () => {
    await resetDatabase(ctx.prisma);
    const outlet = await createOutlet(ctx.prisma);
    const counters = ctx.app.get(CountersService);
    const values = await Promise.all(
      Array.from({ length: 20 }, () =>
        ctx.prisma.$transaction((tx) => counters.next(tx, outlet.id, 'KOT', 'day-1')),
      ),
    );
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(
      await ctx.prisma.$transaction((tx) => counters.next(tx, outlet.id, 'KOT', 'day-2')),
    ).toBe(1);
  });

  it('does not use up a number when the transaction rolls back', async () => {
    await resetDatabase(ctx.prisma);
    const outlet = await createOutlet(ctx.prisma);
    const counters = ctx.app.get(CountersService);
    await ctx.prisma
      .$transaction(async (tx) => {
        await counters.next(tx, outlet.id, 'TOKEN', 'd');
        throw new Error('boom');
      })
      .catch(() => undefined);
    expect(await ctx.prisma.$transaction((tx) => counters.next(tx, outlet.id, 'TOKEN', 'd'))).toBe(
      1,
    );
  });
});
