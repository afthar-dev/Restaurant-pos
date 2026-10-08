import { loadDemo } from '../prisma/demo';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  resetDatabase,
  type TestContext,
} from './helpers';

/** The India date `daysAgo` days before today, as YYYY-MM-DD. */
const istDate = (daysAgo: number) =>
  new Date(Date.now() + 5.5 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);

describe('demo data', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('loads a consistent restaurant once, with sales the reports add up', async () => {
    await resetDatabase(ctx.prisma);
    const outlet = await createOutlet(ctx.prisma);
    await ctx.prisma.taxRate.create({
      data: { outletId: outlet.id, name: 'GST 5%', cgstBp: 250, sgstBp: 250 },
    });
    const o = await createUser(ctx.prisma, outlet.id, { role: 'OWNER', password: 'owner-pass-1' });
    const owner = (await loginWithPassword(ctx, o.phone, 'owner-pass-1')).accessToken;
    const as = { Authorization: `Bearer ${owner}` };

    const notes = await loadDemo(ctx.prisma);
    expect(notes.join(' ')).toMatch(/6 closed days of sales history/);

    const menu = await ctx.http().get('/api/menu').set(as).expect(200);
    expect(menu.body.categories.map((c: { name: string }) => c.name)).toEqual([
      'Starters',
      'Main Course',
      'Biryani',
      'Breads',
      'Drinks',
      'Desserts',
    ]);
    expect(await ctx.prisma.diningTable.count()).toBe(12);

    const report = await ctx
      .http()
      .get(`/api/reports/sales?from=${istDate(6)}&to=${istDate(1)}`)
      .set(as)
      .expect(200);
    const { summary, days, hours, items } = report.body;
    expect(days).toHaveLength(6);
    expect(summary.bills).toBe(await ctx.prisma.bill.count());
    const paid = summary.payments.CASH + summary.payments.UPI + summary.payments.CARD;
    expect(paid).toBe(summary.total);
    expect(hours.length).toBeGreaterThan(5);
    expect(items.length).toBeGreaterThan(10);

    // Each day's counted cash matches what the drawer should hold (one day is ₹50 short).
    const closed = await ctx.prisma.businessDay.findMany({ where: { status: 'CLOSED' } });
    expect(closed.filter((d) => d.variance !== 0).map((d) => d.variance)).toEqual([-5000]);

    await expect(loadDemo(ctx.prisma)).rejects.toThrow('Demo data is already loaded');
  });
});
