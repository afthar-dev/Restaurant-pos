import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Outlet } from '@prisma/client';
import { billFor } from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(120, 3),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(80, 9)]);

// Without R2 settings images go to a local folder; keep this suite's files out of the repo.
const MEDIA_DIR = mkdtempSync(join(tmpdir(), 'rpos-logo-'));
process.env.MEDIA_DIR = MEDIA_DIR;
const fileOf = (url: string) => join(MEDIA_DIR, url.replace('/api/media/', ''));

describe('restaurant logo', () => {
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
  });

  const upload = (file: Buffer, name = 'logo.png', who = owner) =>
    ctx.http().put('/api/outlet/logo').set(who.auth).attach('image', file, name);

  it('sets, replaces and removes the logo without leaving files behind', async () => {
    const first = (await upload(PNG).expect(200)).body.logoUrl as string;
    expect(first).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.png$/);
    expect(existsSync(fileOf(first))).toBe(true);
    expect((await ctx.http().get('/api/outlet').set(waiter.auth).expect(200)).body.logoUrl).toBe(
      first,
    );

    const second = (await upload(JPEG, 'logo.jpg').expect(200)).body.logoUrl as string;
    expect(second).not.toBe(first);
    expect(existsSync(fileOf(first))).toBe(false);
    expect(await ctx.prisma.media.count()).toBe(1);

    const removed = await ctx.http().delete('/api/outlet/logo').set(owner.auth).expect(200);
    expect(removed.body.logoUrl).toBeNull();
    expect(existsSync(fileOf(second))).toBe(false);
    expect(await ctx.prisma.media.count()).toBe(0);
    expect(await ctx.prisma.auditEntry.count({ where: { action: 'outlet.logo' } })).toBe(3);
  });

  it('keeps exactly one logo when two uploads race', async () => {
    const [a, b] = await Promise.all([upload(PNG), upload(JPEG, 'logo.jpg')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const media = await ctx.prisma.media.findMany();
    expect(media).toHaveLength(1);
    const current = await ctx.prisma.outlet.findUniqueOrThrow({ where: { id: outlet.id } });
    expect(current.logoId).toBe(media[0]?.id);
  });

  it('shows the logo on the QR menu and on the bill print payload', async () => {
    const logoUrl = (await upload(PNG).expect(200)).body.logoUrl as string;
    const session = await ctx
      .http()
      .post('/api/qr/sessions')
      .send({ code: r.t1.qrToken })
      .expect(201);
    expect(session.body.outlet).toMatchObject({ name: 'Test Outlet', logoUrl });

    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 0 })
      .expect(201);
    const bill = await billFor(ctx, r, waiter, cashier, [
      { variantId: r.roti.regular.id, quantity: 1 },
    ]);
    const payload = await ctx
      .http()
      .get(`/api/bills/${bill.id}/print-payload`)
      .set(cashier.auth)
      .expect(200);
    expect(payload.body.outlet).toMatchObject({ logoUrl });
  });

  it('refuses other staff, files that are not images and files that are too big', async () => {
    await upload(PNG, 'logo.png', cashier).expect(403);
    const text = await upload(Buffer.from('not an image'), 'logo.png').expect(400);
    expect(text.body.message).toBe('Use a JPEG, PNG or WebP photo.');
    const big = Buffer.concat([PNG, Buffer.alloc(1_100_000)]);
    expect((await upload(big).expect(413)).body.code).toBe('FILE_TOO_LARGE');
    await ctx.http().delete('/api/outlet/logo').set(cashier.auth).expect(403);
    expect(await ctx.prisma.media.count()).toBe(0);
  });
});
