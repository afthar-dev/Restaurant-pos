import { verify } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed';
import { resetDatabase } from './helpers';

describe('seed', () => {
  const prisma = new PrismaClient();

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates exactly one outlet even when run twice', async () => {
    await seed(prisma, {});
    await seed(prisma, {});
    const outlets = await prisma.outlet.findMany();
    expect(outlets).toHaveLength(1);
    expect(outlets[0]?.name).toBe('Main Outlet');
    expect(outlets[0]?.taxScheme).toBe('NONE');
    expect(outlets[0]?.cashierDiscountCapBp).toBe(1000);
  });

  it('creates no users without owner settings', async () => {
    await seed(prisma, {});
    expect(await prisma.user.count()).toBe(0);
  });

  it('creates the owner once from owner settings, with a verifiable password hash', async () => {
    const env = { OWNER_NAME: 'Priya', OWNER_PHONE: '9876500001', OWNER_PASSWORD: 'owner-pass-1' };
    await seed(prisma, env);
    await seed(prisma, env);
    const owners = await prisma.user.findMany({ where: { role: 'OWNER' } });
    expect(owners).toHaveLength(1);
    expect(owners[0]?.name).toBe('Priya');
    expect(owners[0]?.passwordHash).not.toContain('owner-pass-1');
    expect(await verify(owners[0]!.passwordHash!, 'owner-pass-1')).toBe(true);
  });

  it('refuses an invalid owner phone', async () => {
    await expect(
      seed(prisma, { OWNER_PHONE: '12345', OWNER_PASSWORD: 'owner-pass-1' }),
    ).rejects.toThrow(/OWNER_PHONE/);
  });

  it('creates the default kitchen station and GST 5% tax rate once', async () => {
    await seed(prisma, {});
    await seed(prisma, {});
    const stations = await prisma.station.findMany();
    const rates = await prisma.taxRate.findMany();
    expect(stations.map((s) => s.name)).toEqual(['Kitchen']);
    expect(rates.map((r) => [r.name, r.cgstBp, r.sgstBp])).toEqual([['GST 5%', 250, 250]]);
  });
});
