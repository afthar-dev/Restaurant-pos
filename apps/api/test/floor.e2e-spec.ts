import type { Outlet } from '@prisma/client';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  readCookie,
  resetDatabase,
  type TestContext,
} from './helpers';

describe('areas and tables', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let owner: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    const o = await createUser(ctx.prisma, outlet.id, { role: 'OWNER', password: 'owner-pass-1' });
    owner = (await loginWithPassword(ctx, o.phone, 'owner-pass-1')).accessToken;
  });

  const asOwner = {
    get Authorization() {
      return `Bearer ${owner}`;
    },
  };

  async function area(name: string, sortOrder = 0) {
    const res = await ctx
      .http()
      .post('/api/areas')
      .set('Authorization', asOwner.Authorization)
      .send({ name, sortOrder })
      .expect(201);
    return res.body.id as string;
  }

  async function table(areaId: string, name: string, seats = 4) {
    return ctx
      .http()
      .post('/api/tables')
      .set('Authorization', asOwner.Authorization)
      .send({ areaId, name, seats });
  }

  it('returns the floor in area order with tables in name order, without QR secrets', async () => {
    const outdoor = await area('Outdoor', 2);
    const ac = await area('AC Hall', 1);
    for (const name of ['T2', 'T1', 'T10']) expect((await table(ac, name)).status).toBe(201);
    await table(outdoor, 'O1', 2);

    const res = await ctx
      .http()
      .get('/api/floor')
      .set('Authorization', asOwner.Authorization)
      .expect(200);
    expect(res.body.map((a: { name: string }) => a.name)).toEqual(['AC Hall', 'Outdoor']);
    expect(res.body[0].tables.map((t: { name: string }) => t.name)).toEqual(['T1', 'T2', 'T10']);
    expect(JSON.stringify(res.body)).not.toMatch(/qrToken/);
  });

  it('keeps table names unique across the whole outlet', async () => {
    const a = await area('AC Hall');
    const b = await area('Outdoor');
    await table(a, 'T1');
    const res = await table(b, 't1');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NAME_TAKEN');
  });

  it('gives each table its own QR token for the owner', async () => {
    const a = await area('AC Hall');
    const t1 = await table(a, 'T1');
    const t2 = await table(a, 'T2');
    const r1 = await ctx
      .http()
      .get(`/api/tables/${t1.body.id}`)
      .set('Authorization', asOwner.Authorization)
      .expect(200);
    const r2 = await ctx
      .http()
      .get(`/api/tables/${t2.body.id}`)
      .set('Authorization', asOwner.Authorization);
    expect(r1.body.qrToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(r1.body.qrToken).not.toBe(r2.body.qrToken);
  });

  it('will not archive an area that still has tables', async () => {
    const a = await area('AC Hall');
    const t1 = await table(a, 'T1');
    const blocked = await ctx
      .http()
      .post(`/api/areas/${a}/archive`)
      .set('Authorization', asOwner.Authorization)
      .expect(409);
    expect(blocked.body.code).toBe('IN_USE');

    await ctx
      .http()
      .post(`/api/tables/${t1.body.id}/archive`)
      .set('Authorization', asOwner.Authorization)
      .expect(201);
    await ctx
      .http()
      .post(`/api/areas/${a}/archive`)
      .set('Authorization', asOwner.Authorization)
      .expect(201);
    const floor = await ctx.http().get('/api/floor').set('Authorization', asOwner.Authorization);
    expect(floor.body).toEqual([]);
  });

  it('moves a table to another area and renames it', async () => {
    const a = await area('AC Hall');
    const b = await area('Outdoor');
    const t1 = await table(a, 'T1');
    const res = await ctx
      .http()
      .put(`/api/tables/${t1.body.id}`)
      .set('Authorization', asOwner.Authorization)
      .send({ areaId: b, name: 'O1', seats: 6 })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'O1', seats: 6, areaId: b });
  });

  it('lets a waiter read the floor but not change it', async () => {
    const waiter = await createUser(ctx.prisma, outlet.id, { role: 'WAITER', pin: '1234' });
    const device = await ctx
      .http()
      .post('/api/devices')
      .set('Authorization', asOwner.Authorization)
      .send({ name: 'Phone', type: 'CAPTAIN' });
    const login = await ctx
      .http()
      .post('/api/auth/pin-login')
      .set('Cookie', `rpos_dt=${readCookie(device, 'rpos_dt')}`)
      .send({ userId: waiter.id, pin: '1234' });
    const token = login.body.accessToken as string;
    await ctx.http().get('/api/floor').set('Authorization', `Bearer ${token}`).expect(200);
    await ctx
      .http()
      .post('/api/areas')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rooftop' })
      .expect(403);
  });
});
