import type { Outlet, User } from '@prisma/client';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  resetDatabase,
  type TestContext,
} from './helpers';

describe('staff management', () => {
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
    owner = await createUser(ctx.prisma, outlet.id, {
      role: 'OWNER',
      password: 'owner-pass-1',
      name: 'Priya',
    });
    ownerToken = (await loginWithPassword(ctx, owner.phone, 'owner-pass-1')).accessToken;
  });

  const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

  it('creates a cashier with a PIN and never returns hashes', async () => {
    const res = await ctx
      .http()
      .post('/api/users')
      .set(auth())
      .send({ name: 'Arun', phone: '9876500011', role: 'CASHIER', pin: '4321' })
      .expect(201);
    expect(res.body).toMatchObject({
      name: 'Arun',
      phone: '9876500011',
      role: 'CASHIER',
      hasPin: true,
      hasPassword: false,
      archivedAt: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Hash|\$argon2/);

    const list = await ctx.http().get('/api/users').set(auth()).expect(200);
    expect(JSON.stringify(list.body)).not.toMatch(/Hash|\$argon2/);
    expect(list.body).toHaveLength(2);
  });

  it('refuses a duplicate phone number', async () => {
    const res = await ctx
      .http()
      .post('/api/users')
      .set(auth())
      .send({ name: 'Copy', phone: owner.phone, role: 'WAITER', pin: '1111' })
      .expect(409);
    expect(res.body.code).toBe('PHONE_TAKEN');
  });

  it('forbids a manager from managing staff', async () => {
    const manager = await createUser(ctx.prisma, outlet.id, {
      role: 'MANAGER',
      password: 'manager-pass-1',
    });
    const { accessToken } = await loginWithPassword(ctx, manager.phone, 'manager-pass-1');
    await ctx.http().get('/api/users').set('Authorization', `Bearer ${accessToken}`).expect(403);
  });

  it('cuts off an archived user immediately and allows restoring them', async () => {
    const manager = await createUser(ctx.prisma, outlet.id, {
      role: 'MANAGER',
      password: 'manager-pass-1',
    });
    const session = await loginWithPassword(ctx, manager.phone, 'manager-pass-1');

    await ctx.http().post(`/api/users/${manager.id}/archive`).set(auth()).expect(201);

    const me = await ctx
      .http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    expect(me.body.code).toBe('USER_INACTIVE');
    await ctx
      .http()
      .post('/api/auth/refresh')
      .set('Cookie', `rpos_rt=${session.refreshCookie}`)
      .expect(401);

    const restored = await ctx
      .http()
      .post(`/api/users/${manager.id}/restore`)
      .set(auth())
      .expect(201);
    expect(restored.body.archivedAt).toBeNull();
    await loginWithPassword(ctx, manager.phone, 'manager-pass-1');
  });

  it('does not let the owner archive themselves', async () => {
    const res = await ctx.http().post(`/api/users/${owner.id}/archive`).set(auth()).expect(409);
    expect(res.body.code).toBe('CANNOT_ARCHIVE_SELF');
  });

  it('keeps at least one active owner', async () => {
    const res = await ctx
      .http()
      .patch(`/api/users/${owner.id}`)
      .set(auth())
      .send({ role: 'MANAGER' })
      .expect(409);
    expect(res.body.code).toBe('LAST_OWNER');
  });

  it('resetting a PIN unlocks the user and ends their sessions', async () => {
    const waiter = await createUser(ctx.prisma, outlet.id, { role: 'WAITER', pin: '1234' });
    await ctx.prisma.user.update({
      where: { id: waiter.id },
      data: { pinLockedUntil: new Date(Date.now() + 600_000) },
    });
    const res = await ctx
      .http()
      .patch(`/api/users/${waiter.id}`)
      .set(auth())
      .send({ pin: '8765' })
      .expect(200);
    expect(res.body.lockedUntil).toBeNull();
  });

  it('records staff changes in the audit log', async () => {
    await ctx
      .http()
      .post('/api/users')
      .set(auth())
      .send({ name: 'Arun', phone: '9876500011', role: 'CASHIER', pin: '4321' })
      .expect(201);
    const audit = await ctx.http().get('/api/audit').set(auth()).expect(200);
    expect(audit.body[0]).toMatchObject({
      action: 'user.create',
      actor: { id: owner.id, name: 'Priya' },
    });
    expect(JSON.stringify(audit.body)).not.toMatch(/4321|\$argon2/);
  });

  it('returns 404 for a user in another outlet', async () => {
    const other = await ctx.prisma.outlet.create({ data: { name: 'Elsewhere' } });
    const stranger = await createUser(ctx.prisma, other.id, { role: 'WAITER', pin: '1234' });
    await ctx
      .http()
      .patch(`/api/users/${stranger.id}`)
      .set(auth())
      .send({ name: 'Hijacked' })
      .expect(404);
  });
});
