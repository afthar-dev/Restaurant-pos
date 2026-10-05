import { Controller, Post } from '@nestjs/common';
import type { Outlet, User } from '@prisma/client';
import { RequirePermissions } from '../src/auth/decorators';
import { TokenService } from '../src/auth/token.service';
import { CurrentActor, type AuthUser } from '../src/common/request-context';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  rawSetCookie,
  readCookie,
  resetDatabase,
  type TestContext,
} from './helpers';

/** Test-only route that needs bill.void and reports who was held accountable. */
@Controller('probe')
class ProbeController {
  @Post('void')
  @RequirePermissions('bill.void')
  voidSomething(@CurrentActor() actor: AuthUser) {
    return { actorId: actor.id };
  }
}

describe('devices, PIN login and manager override', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let manager: User;
  let cashier: User;
  let managerToken: string;
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
    managerToken = (await loginWithPassword(ctx, manager.phone, 'manager-pass-1')).accessToken;

    const res = await ctx
      .http()
      .post('/api/devices')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Counter 1', type: 'POS' })
      .expect(201);
    deviceCookie = readCookie(res, 'rpos_dt') ?? '';
  });

  async function pinLogin(userId: string, pin: string, cookie = deviceCookie) {
    return ctx
      .http()
      .post('/api/auth/pin-login')
      .set('Cookie', `rpos_dt=${cookie}`)
      .send({ userId, pin });
  }

  it('registers a device with an httpOnly cookie scoped to /api', async () => {
    const res = await ctx
      .http()
      .post('/api/devices')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Kitchen screen', type: 'KDS' })
      .expect(201);
    expect(res.body).toEqual({ id: expect.any(String), name: 'Kitchen screen', type: 'KDS' });
    const cookie = rawSetCookie(res, 'rpos_dt');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api;/);
  });

  it('does not let a cashier register devices', async () => {
    const res = await pinLogin(cashier.id, '1234');
    await ctx
      .http()
      .post('/api/devices')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ name: 'Rogue', type: 'POS' })
      .expect(403);
  });

  it('recognises the current device only with its cookie', async () => {
    const res = await ctx
      .http()
      .get('/api/devices/current')
      .set('Cookie', `rpos_dt=${deviceCookie}`)
      .expect(200);
    expect(res.body.name).toBe('Counter 1');
    const missing = await ctx.http().get('/api/devices/current').expect(401);
    expect(missing.body.code).toBe('DEVICE_NOT_REGISTERED');
  });

  it('lists only active staff who have a PIN', async () => {
    await createUser(ctx.prisma, outlet.id, { role: 'OWNER', password: 'owner-pass-1' });
    const gone = await createUser(ctx.prisma, outlet.id, { role: 'WAITER', pin: '5555' });
    await ctx.prisma.user.update({ where: { id: gone.id }, data: { archivedAt: new Date() } });

    const res = await ctx
      .http()
      .get('/api/auth/staff')
      .set('Cookie', `rpos_dt=${deviceCookie}`)
      .expect(200);
    const names = (res.body as { name: string }[]).map((s) => s.name).sort();
    expect(names).toEqual(['Arun', 'Meera']);
  });

  it('signs a cashier in with the right PIN on a registered device', async () => {
    const res = await pinLogin(cashier.id, '1234').then((r) => r);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: cashier.id, name: 'Arun', role: 'CASHIER' });
    expect(readCookie(res, 'rpos_rt')).toBeTruthy();
  });

  it('locks after 5 wrong PINs, even when the 6th is right', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await pinLogin(cashier.id, '0000')).status).toBe(401);
    }
    const res = await pinLogin(cashier.id, '1234');
    expect(res.status).toBe(423);
  });

  it('refuses PIN login without a device cookie or on a revoked device', async () => {
    const none = await ctx
      .http()
      .post('/api/auth/pin-login')
      .send({ userId: cashier.id, pin: '1234' })
      .expect(401);
    expect(none.body.code).toBe('DEVICE_NOT_REGISTERED');

    const device = await ctx.prisma.device.findFirstOrThrow({ where: { name: 'Counter 1' } });
    await ctx
      .http()
      .delete(`/api/devices/${device.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(204);
    expect((await pinLogin(cashier.id, '1234')).status).toBe(401);
  });

  it('ends PIN sessions when their device is revoked', async () => {
    const login = await pinLogin(cashier.id, '1234');
    const refresh = readCookie(login, 'rpos_rt');
    const device = await ctx.prisma.device.findFirstOrThrow({ where: { name: 'Counter 1' } });
    await ctx
      .http()
      .delete(`/api/devices/${device.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(204);
    await ctx.http().post('/api/auth/refresh').set('Cookie', `rpos_rt=${refresh}`).expect(401);
  });

  describe('manager override', () => {
    let cashierToken: string;

    beforeEach(async () => {
      cashierToken = (await pinLogin(cashier.id, '1234')).body.accessToken;
    });

    async function requestOverride(userId: string, pin: string, permission: string) {
      return ctx
        .http()
        .post('/api/auth/override')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ userId, pin, permission });
    }

    it('forbids the cashier alone', async () => {
      const res = await ctx
        .http()
        .post('/api/probe/void')
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', permission: 'bill.void' });
    });

    it('allows the action with a manager override and records the manager as actor', async () => {
      const override = await requestOverride(manager.id, '9999', 'bill.void');
      expect(override.status).toBe(201);
      expect(override.body.expiresInSeconds).toBe(60);

      const res = await ctx
        .http()
        .post('/api/probe/void')
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('x-override-token', override.body.overrideToken)
        .expect(201);
      expect(res.body.actorId).toBe(manager.id);

      const audit = await ctx.prisma.auditEntry.findFirst({ where: { action: 'auth.override' } });
      expect(audit?.actorId).toBe(manager.id);
    });

    it('rejects an override issued for a different permission', async () => {
      const override = await requestOverride(manager.id, '9999', 'day.openClose');
      await ctx
        .http()
        .post('/api/probe/void')
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('x-override-token', override.body.overrideToken)
        .expect(403);
    });

    it('rejects an expired override token', async () => {
      const expired = ctx.app
        .get(TokenService)
        .signOverride({ sub: manager.id, oid: outlet.id, perm: 'bill.void', req: cashier.id }, -1);
      await ctx
        .http()
        .post('/api/probe/void')
        .set('Authorization', `Bearer ${cashierToken}`)
        .set('x-override-token', expired)
        .expect(403);
    });

    it('refuses to issue an override with a wrong PIN or from someone without the permission', async () => {
      const wrongPin = await requestOverride(manager.id, '0000', 'bill.void');
      expect(wrongPin.status).toBe(403);
      expect(wrongPin.body.code).toBe('OVERRIDE_DENIED');

      const ownPin = await requestOverride(cashier.id, '1234', 'bill.void');
      expect(ownPin.status).toBe(403);
      expect(ownPin.body.code).toBe('OVERRIDE_DENIED');
    });
  });
});
