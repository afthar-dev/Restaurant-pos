import type { Outlet, User } from '@prisma/client';
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

describe('auth: password login, sessions', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let manager: User;
  const password = 'manager-pass-1';

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    manager = await createUser(ctx.prisma, outlet.id, { role: 'MANAGER', password, name: 'Meera' });
  });

  it('logs in and sets an httpOnly, strict refresh cookie scoped to /api/auth', async () => {
    const res = await ctx
      .http()
      .post('/api/auth/login')
      .send({ phone: manager.phone, password })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: manager.id, name: 'Meera', role: 'MANAGER' });
    expect(res.body.permissions).toContain('bill.void');
    expect(res.body.permissions).not.toContain('users.manage');

    const cookie = rawSetCookie(res, 'rpos_rt');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(JSON.stringify(res.body)).not.toMatch(/Hash/);
  });

  it('gives the same answer for an unknown phone and a wrong password', async () => {
    const wrong = await ctx
      .http()
      .post('/api/auth/login')
      .send({ phone: manager.phone, password: 'nope-nope-nope' })
      .expect(401);
    const unknown = await ctx
      .http()
      .post('/api/auth/login')
      .send({ phone: '9000000000', password })
      .expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rejects a malformed body with VALIDATION', async () => {
    const res = await ctx.http().post('/api/auth/login').send({ phone: '12' }).expect(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('locks the account after 5 wrong passwords, even for the right one', async () => {
    for (let i = 0; i < 5; i += 1) {
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ phone: manager.phone, password: 'wrong-password' })
        .expect(401);
    }
    const res = await ctx
      .http()
      .post('/api/auth/login')
      .send({ phone: manager.phone, password })
      .expect(423);
    expect(res.body.code).toBe('LOCKED');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(800);
  });

  it('does not let a PIN-only cashier use password login', async () => {
    const cashier = await createUser(ctx.prisma, outlet.id, { role: 'CASHIER', pin: '1234' });
    await ctx
      .http()
      .post('/api/auth/login')
      .send({ phone: cashier.phone, password: '1234-1234' })
      .expect(401);
  });

  it('protects /api/auth/me and returns the user with a valid token', async () => {
    await ctx.http().get('/api/auth/me').expect(401);
    await ctx.http().get('/api/auth/me').set('Authorization', 'Bearer not-a-token').expect(401);

    const { accessToken } = await loginWithPassword(ctx, manager.phone, password);
    const res = await ctx
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.user.id).toBe(manager.id);
    expect(res.body.outlet).toEqual({ id: outlet.id, name: outlet.name });
  });

  it('rotates the refresh cookie and issues a working access token', async () => {
    const first = await loginWithPassword(ctx, manager.phone, password);
    const res = await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', `rpos_rt=${first.refreshCookie}`)
      .expect(200);
    const rotated = readCookie(res, 'rpos_rt');
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(first.refreshCookie);
    await ctx
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('treats reuse of a rotated refresh token as theft and revokes the family', async () => {
    const first = await loginWithPassword(ctx, manager.phone, password);
    const res = await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', `rpos_rt=${first.refreshCookie}`)
      .expect(200);
    const rotated = readCookie(res, 'rpos_rt');
    // Outside the 30 s grace window that absorbs two tabs refreshing together.
    await ctx.prisma.refreshSession.updateMany({
      where: { rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', `rpos_rt=${first.refreshCookie}`)
      .expect(401);
    expect(replay.body.code).toBe('SESSION_EXPIRED');

    await ctx.http().post('/api/auth/refresh').set('Cookie', `rpos_rt=${rotated}`).expect(401);
  });

  it('refuses refresh without a cookie', async () => {
    const res = await ctx.http().post('/api/auth/refresh').expect(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
  });

  it('logs out: refresh afterwards fails and the cookie is cleared', async () => {
    const first = await loginWithPassword(ctx, manager.phone, password);
    const res = await ctx
      .http()
      .post('/api/auth/logout')
      .set('Cookie', `rpos_rt=${first.refreshCookie}`)
      .expect(204);
    expect(rawSetCookie(res, 'rpos_rt')).toMatch(/Expires=Thu, 01 Jan 1970/);
    await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', `rpos_rt=${first.refreshCookie}`)
      .expect(401);
  });

  it('refuses refresh for an archived user', async () => {
    const first = await loginWithPassword(ctx, manager.phone, password);
    await ctx.prisma.user.update({ where: { id: manager.id }, data: { archivedAt: new Date() } });
    await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', `rpos_rt=${first.refreshCookie}`)
      .expect(401);
  });

  it('rejects an access token once the user is archived', async () => {
    const { accessToken } = await loginWithPassword(ctx, manager.phone, password);
    await ctx.prisma.user.update({ where: { id: manager.id }, data: { archivedAt: new Date() } });
    const res = await ctx
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    expect(res.body.code).toBe('USER_INACTIVE');
  });

  it('keeps /api/health public', async () => {
    await ctx.http().get('/api/health').expect(200);
  });
});
