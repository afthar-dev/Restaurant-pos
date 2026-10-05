import type { Outlet } from '@prisma/client';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  resetDatabase,
  type TestContext,
} from './helpers';

describe('tax rates, stations and printers', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let owner: string;
  let manager: string;

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
    const m = await createUser(ctx.prisma, outlet.id, { role: 'MANAGER', password: 'mgr-pass-11' });
    owner = (await loginWithPassword(ctx, o.phone, 'owner-pass-1')).accessToken;
    manager = (await loginWithPassword(ctx, m.phone, 'mgr-pass-11')).accessToken;
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('tax rates', () => {
    it('creates GST 18% split into CGST and SGST', async () => {
      const res = await ctx
        .http()
        .post('/api/tax-rates')
        .set(as(owner))
        .send({ name: 'GST 18%', totalBp: 1800 })
        .expect(201);
      expect(res.body).toMatchObject({ name: 'GST 18%', cgstBp: 900, sgstBp: 900, totalBp: 1800 });
    });

    it('is owner-only to change but readable by a manager', async () => {
      await ctx
        .http()
        .post('/api/tax-rates')
        .set(as(manager))
        .send({ name: 'GST 12%', totalBp: 1200 })
        .expect(403);
      await ctx.http().get('/api/tax-rates').set(as(manager)).expect(200);
    });

    it('refuses a duplicate name', async () => {
      await ctx.http().post('/api/tax-rates').set(as(owner)).send({ name: 'GST 5%', totalBp: 500 });
      const res = await ctx
        .http()
        .post('/api/tax-rates')
        .set(as(owner))
        .send({ name: 'gst 5%', totalBp: 500 })
        .expect(409);
      expect(res.body.code).toBe('NAME_TAKEN');
    });

    it('updates a rate and hides archived ones unless asked', async () => {
      const created = await ctx
        .http()
        .post('/api/tax-rates')
        .set(as(owner))
        .send({ name: 'GST 12%', totalBp: 1200 });
      const updated = await ctx
        .http()
        .put(`/api/tax-rates/${created.body.id}`)
        .set(as(owner))
        .send({ name: 'GST 12% (old)', totalBp: 1200 })
        .expect(200);
      expect(updated.body.name).toBe('GST 12% (old)');
      await ctx.http().post(`/api/tax-rates/${created.body.id}/archive`).set(as(owner)).expect(201);
      const active = await ctx.http().get('/api/tax-rates').set(as(owner));
      expect(active.body).toHaveLength(0);
      const all = await ctx.http().get('/api/tax-rates?include=archived').set(as(owner));
      expect(all.body).toHaveLength(1);
    });
  });

  describe('stations and printers', () => {
    it('creates a station and a KOT printer for it', async () => {
      const station = await ctx
        .http()
        .post('/api/stations')
        .set(as(owner))
        .send({ name: 'Tandoor' })
        .expect(201);
      const printer = await ctx
        .http()
        .post('/api/printers')
        .set(as(owner))
        .send({
          name: 'Tandoor printer',
          purpose: 'KOT',
          stationId: station.body.id,
          mode: 'BROWSER',
          paperWidthMm: 80,
        })
        .expect(201);
      expect(printer.body.station).toEqual({ id: station.body.id, name: 'Tandoor' });
    });

    it('refuses a KOT printer without a station', async () => {
      const res = await ctx
        .http()
        .post('/api/printers')
        .set(as(owner))
        .send({ name: 'P', purpose: 'KOT', mode: 'BROWSER', paperWidthMm: 58 })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('refuses a station from another outlet', async () => {
      const other = await ctx.prisma.outlet.create({ data: { name: 'Other' } });
      const foreign = await ctx.prisma.station.create({ data: { outletId: other.id, name: 'X' } });
      const res = await ctx
        .http()
        .post('/api/printers')
        .set(as(owner))
        .send({
          name: 'P',
          purpose: 'KOT',
          stationId: foreign.id,
          mode: 'BROWSER',
          paperWidthMm: 58,
        })
        .expect(400);
      expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'stationId' });
    });

    it('will not archive a station that a printer still uses', async () => {
      const station = await ctx.http().post('/api/stations').set(as(owner)).send({ name: 'Bar' });
      await ctx.http().post('/api/printers').set(as(owner)).send({
        name: 'Bar printer',
        purpose: 'KOT',
        stationId: station.body.id,
        mode: 'BROWSER',
        paperWidthMm: 58,
      });
      const res = await ctx
        .http()
        .post(`/api/stations/${station.body.id}/archive`)
        .set(as(owner))
        .expect(409);
      expect(res.body.code).toBe('IN_USE');
    });

    it('records changes in the audit log', async () => {
      await ctx.http().post('/api/stations').set(as(owner)).send({ name: 'Bar' }).expect(201);
      const entry = await ctx.prisma.auditEntry.findFirst({ where: { action: 'station.create' } });
      expect(entry).not.toBeNull();
    });
  });
});
