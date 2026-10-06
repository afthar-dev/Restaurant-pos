import type { Outlet } from '@prisma/client';
import { billFor, pay } from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('QR ordering', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let r: Restaurant;
  let owner: SignedIn;
  let cashier: SignedIn;
  let waiter: SignedIn;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    r = await buildRestaurant(ctx.prisma, outlet.id);
    owner = await signIn(ctx, outlet.id, 'OWNER');
    cashier = await signIn(ctx, outlet.id, 'CASHIER', 'Kavya');
    waiter = await signIn(ctx, outlet.id, 'WAITER', 'Arun');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 0 })
      .expect(201);
  });

  const start = (code: string) => ctx.http().post('/api/qr/sessions').send({ code });
  const scan = async (code = r.t1.qrToken) => (await start(code).expect(201)).body.token as string;
  const menu = (token: string) => ctx.http().get('/api/qr/menu').set('x-qr-session', token);

  describe('sessions and menu', () => {
    it('starts a session from the table sticker', async () => {
      const res = await start(r.t1.qrToken).expect(201);
      expect(res.body).toEqual({
        token: expect.any(String),
        table: { name: 'T1' },
        outlet: { name: outlet.name },
      });
      const stored = await ctx.prisma.qrSession.findFirstOrThrow();
      expect(stored.tokenHash).not.toBe(res.body.token);
    });

    it('refuses an unknown or archived table code', async () => {
      const unknown = await start('x'.repeat(40)).expect(404);
      expect(unknown.body.code).toBe('QR_UNKNOWN');
      await ctx.prisma.diningTable.update({
        where: { id: r.t2.id },
        data: { archivedAt: new Date() },
      });
      await start(r.t2.qrToken).expect(404);
    });

    it('shows only what can be ordered now, at dine-in prices', async () => {
      const res = await menu(await scan()).expect(200);
      const items = res.body.categories.flatMap((c: { items: { name: string }[] }) => c.items) as {
        name: string;
        variants: { name: string; price: number }[];
        addonGroups: { addons: { name: string }[] }[];
      }[];
      expect(items.map((i) => i.name)).not.toContain('Veg Soup');
      const paneer = items.find((i) => i.name === 'Paneer Tikka')!;
      expect(paneer.variants).toEqual([
        { id: r.paneer.half.id, name: 'Half', price: 18000 },
        { id: r.paneer.full.id, name: 'Full', price: 32000 },
      ]);
      expect(paneer.addonGroups[0]!.addons.map((a) => a.name)).toEqual(['Cheese']);
    });

    it('needs a live session', async () => {
      const missing = await ctx.http().get('/api/qr/menu').expect(401);
      expect(missing.body.code).toBe('QR_SESSION_ENDED');
      await menu('not-a-session').expect(401);
      const token = await scan();
      await ctx.prisma.qrSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await menu(token).expect(401);
    });

    it('ends the session when the table is paid and free again', async () => {
      const token = await scan();
      const bill = await billFor(ctx, r, waiter, cashier, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      await menu(token).expect(200);
      await pay(ctx, cashier, bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
      const ended = await menu(token).expect(401);
      expect(ended.body.message).toBe('Scan the table QR again.');
      await menu(await scan()).expect(200);
    });

    it('ends the session when the order is moved to another table', async () => {
      const token = await scan();
      const created = await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
        .expect(201);
      await ctx
        .http()
        .post(`/api/orders/${created.body.id}/move`)
        .set(waiter.auth)
        .send({ tableId: r.t2.id })
        .expect(201);
      await menu(token).expect(401);
    });
  });
});
