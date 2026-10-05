import { Controller, Post } from '@nestjs/common';
import type { Outlet, User } from '@prisma/client';
import { RequirePermissions } from '../src/auth/decorators';
import { CurrentActor, type AuthUser } from '../src/common/request-context';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  readCookie,
  resetDatabase,
  type TestContext,
} from './helpers';

@Controller('probe-sec')
class ProbeController {
  @Post('void')
  @RequirePermissions('bill.void')
  voidSomething(@CurrentActor() actor: AuthUser) {
    return { actorId: actor.id };
  }
}

/** Regressions from the M0b final review. */
describe('security fixes', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let owner: User;
  let manager: User;
  let cashier: User;
  let ownerToken: string;
  let deviceCookie: string;

  beforeAll(async () => {
    ctx = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    owner = await createUser(ctx.prisma, outlet.id, {
      role: 'OWNER',
      password: 'owner-pass-1',
      pin: '4321',
      name: 'Priya',
    });
    manager = await createUser(ctx.prisma, outlet.id, {
      role: 'MANAGER',
      password: 'manager-pass-1',
      pin: '9999',
      name: 'Meera',
    });
    cashier = await createUser(ctx.prisma, outlet.id, {
      role: 'CASHIER',
      pin: '1234',
      name: 'Arun',
    });
    ownerToken = (await loginWithPassword(ctx, owner.phone, 'owner-pass-1')).accessToken;
    const res = await ctx
      .http()
      .post('/api/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Counter 1', type: 'POS' })
      .expect(201);
    deviceCookie = readCookie(res, 'rpos_dt') ?? '';
  });

  const pinLogin = (userId: string, pin: string) =>
    ctx
      .http()
      .post('/api/auth/pin-login')
      .set('Cookie', `rpos_dt=${deviceCookie}`)
      .send({ userId, pin });

  describe('approval PINs are not sign-in credentials (#1)', () => {
    it('keeps owners and managers off the PIN pad list', async () => {
      const res = await ctx
        .http()
        .get('/api/auth/staff')
        .set('Cookie', `rpos_dt=${deviceCookie}`)
        .expect(200);
      expect((res.body as { name: string }[]).map((s) => s.name)).toEqual(['Arun']);
    });

    it('refuses PIN sign-in for an owner or manager even with the right PIN', async () => {
      expect((await pinLogin(owner.id, '4321')).status).toBe(401);
      expect((await pinLogin(manager.id, '9999')).status).toBe(401);
    });

    it('requires a password when promoting someone to manager or owner', async () => {
      const res = await ctx
        .http()
        .patch(`/api/users/${cashier.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'MANAGER' })
        .expect(400);
      expect(res.body.code).toBe('PASSWORD_REQUIRED');
      await ctx
        .http()
        .patch(`/api/users/${cashier.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'MANAGER', password: 'new-manager-1' })
        .expect(200);
    });

    it('refuses to clear the password of a manager', async () => {
      const res = await ctx
        .http()
        .patch(`/api/users/${manager.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ password: null })
        .expect(400);
      expect(res.body.code).toBe('PASSWORD_REQUIRED');
    });
  });

  describe('override tokens are single use (#3)', () => {
    it('authorises exactly one action', async () => {
      const cashierToken = (await pinLogin(cashier.id, '1234')).body.accessToken as string;
      const override = await ctx
        .http()
        .post('/api/auth/override')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ userId: manager.id, pin: '9999', permission: 'bill.void' })
        .expect(201);
      const use = () =>
        ctx
          .http()
          .post('/api/probe-sec/void')
          .set('Authorization', `Bearer ${cashierToken}`)
          .set('x-override-token', override.body.overrideToken);
      expect((await use()).status).toBe(201);
      expect((await use()).status).toBe(403);
    });
  });

  describe('lockout (#2, #4)', () => {
    it('judges at most 5 guesses when attempts arrive at the same time', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 10 }, () => pinLogin(cashier.id, '0000')),
      );
      const statuses = attempts.map((r) => r.status);
      expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(5);
      expect(statuses.filter((s) => s === 423).length).toBeGreaterThanOrEqual(5);
    });

    it('does not lock a manager out of password sign-in through failed approval PINs', async () => {
      const cashierToken = (await pinLogin(cashier.id, '1234')).body.accessToken as string;
      for (let i = 0; i < 5; i += 1) {
        await ctx
          .http()
          .post('/api/auth/override')
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({ userId: manager.id, pin: '0000', permission: 'bill.void' })
          .expect(403);
      }
      await loginWithPassword(ctx, manager.phone, 'manager-pass-1');
    });

    it('locks password guessing per network address, so a stranger cannot lock the owner out everywhere', async () => {
      for (let i = 0; i < 5; i += 1) {
        await ctx
          .http()
          .post('/api/auth/login')
          .set('X-Forwarded-For', '203.0.113.9')
          .send({ phone: owner.phone, password: 'guess-guess-1' })
          .expect(401);
      }
      await ctx
        .http()
        .post('/api/auth/login')
        .set('X-Forwarded-For', '203.0.113.9')
        .send({ phone: owner.phone, password: 'owner-pass-1' })
        .expect(423);
      await ctx
        .http()
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.7')
        .send({ phone: owner.phone, password: 'owner-pass-1' })
        .expect(200);
    });

    it('records a lockout in the audit log', async () => {
      for (let i = 0; i < 5; i += 1) await pinLogin(cashier.id, '0000');
      const entry = await ctx.prisma.auditEntry.findFirst({ where: { action: 'auth.locked' } });
      expect(entry?.entityId).toBe(cashier.id);
    });
  });

  describe('refresh races (#6)', () => {
    it('lets two tabs refresh with the same cookie at the same moment', async () => {
      const { refreshCookie } = await loginWithPassword(ctx, owner.phone, 'owner-pass-1');
      const [a, b] = await Promise.all([
        ctx.http().post('/api/auth/refresh').set('Cookie', `rpos_rt=${refreshCookie}`),
        ctx.http().post('/api/auth/refresh').set('Cookie', `rpos_rt=${refreshCookie}`),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      for (const res of [a, b]) {
        await ctx
          .http()
          .post('/api/auth/refresh')
          .set('Cookie', `rpos_rt=${readCookie(res, 'rpos_rt')}`)
          .expect(200);
      }
    });

    it('still treats reuse after the grace window as theft', async () => {
      const { refreshCookie } = await loginWithPassword(ctx, owner.phone, 'owner-pass-1');
      const first = await ctx
        .http()
        .post('/api/auth/refresh')
        .set('Cookie', `rpos_rt=${refreshCookie}`)
        .expect(200);
      await ctx.prisma.refreshSession.updateMany({
        where: { rotatedAt: { not: null } },
        data: { rotatedAt: new Date(Date.now() - 60_000) },
      });
      await ctx
        .http()
        .post('/api/auth/refresh')
        .set('Cookie', `rpos_rt=${refreshCookie}`)
        .expect(401);
      await ctx
        .http()
        .post('/api/auth/refresh')
        .set('Cookie', `rpos_rt=${readCookie(first, 'rpos_rt')}`)
        .expect(401);
    });
  });
});

describe('PIN throttling per device (#8)', () => {
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

  it('gives each registered device its own PIN attempt budget behind one shop IP', async () => {
    await resetDatabase(ctx.prisma);
    const outlet = await createOutlet(ctx.prisma);
    const owner = await createUser(ctx.prisma, outlet.id, {
      role: 'OWNER',
      password: 'owner-pass-1',
    });
    const waiter = await createUser(ctx.prisma, outlet.id, { role: 'WAITER', pin: '1234' });
    const { accessToken } = await loginWithPassword(ctx, owner.phone, 'owner-pass-1');
    const register = async (name: string) =>
      readCookie(
        await ctx
          .http()
          .post('/api/devices')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name, type: 'CAPTAIN' })
          .expect(201),
        'rpos_dt',
      );
    const phoneA = await register('Phone A');
    const phoneB = await register('Phone B');
    const attempt = (cookie: string | undefined) =>
      ctx
        .http()
        .post('/api/auth/pin-login')
        .set('Cookie', `rpos_dt=${cookie}`)
        .send({ userId: waiter.id, pin: '1234' });

    for (let i = 0; i < 3; i += 1) expect((await attempt(phoneA)).status).toBe(200);
    expect((await attempt(phoneA)).status).toBe(429);
    expect((await attempt(phoneB)).status).toBe(200);
  });
});
