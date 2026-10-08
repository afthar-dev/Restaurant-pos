import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Outlet, Station, TaxRate } from '@prisma/client';
import {
  createOutlet,
  createTestApp,
  createUser,
  loginWithPassword,
  readCookie,
  resetDatabase,
  type TestContext,
} from './helpers';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100, 1),
]);

// Without R2 settings photos go to a local folder; keep this suite's files out of the repo.
const MEDIA_DIR = mkdtempSync(join(tmpdir(), 'rpos-media-'));
process.env.MEDIA_DIR = MEDIA_DIR;
const fileOf = (url: string) => join(MEDIA_DIR, url.replace('/api/media/', ''));

describe('dish photos', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let station: Station;
  let tax: TaxRate;
  let owner: string;
  let waiter: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    station = await ctx.prisma.station.create({ data: { outletId: outlet.id, name: 'Kitchen' } });
    tax = await ctx.prisma.taxRate.create({
      data: { outletId: outlet.id, name: 'GST 5%', cgstBp: 250, sgstBp: 250 },
    });
    const o = await createUser(ctx.prisma, outlet.id, { role: 'OWNER', password: 'owner-pass-1' });
    const w = await createUser(ctx.prisma, outlet.id, { role: 'WAITER', pin: '1234' });
    owner = (await loginWithPassword(ctx, o.phone, 'owner-pass-1')).accessToken;
    const device = await ctx
      .http()
      .post('/api/devices')
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: 'Phone', type: 'CAPTAIN' });
    waiter = (
      await ctx
        .http()
        .post('/api/auth/pin-login')
        .set('Cookie', `rpos_dt=${readCookie(device, 'rpos_dt')}`)
        .send({ userId: w.id, pin: '1234' })
    ).body.accessToken;
  });

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function dish(): Promise<string> {
    const cat = await ctx
      .http()
      .post('/api/menu/categories')
      .set(as(owner))
      .send({ name: 'Starters', stationId: station.id })
      .expect(201);
    const item = await ctx
      .http()
      .post('/api/menu/items')
      .set(as(owner))
      .send({
        categoryId: cat.body.id,
        name: 'Paneer Tikka',
        foodType: 'VEG',
        taxRateId: tax.id,
        variants: [{ name: 'Regular', dineInPrice: 22000 }],
        addonGroupIds: [],
        isCombo: false,
        components: [],
      })
      .expect(201);
    return item.body.id as string;
  }

  const upload = (id: string, file: Buffer, name = 'photo.jpg', token = owner) =>
    ctx.http().put(`/api/menu/items/${id}/image`).set(as(token)).attach('image', file, name);

  const imageUrl = async () =>
    (
      (await ctx.http().get('/api/menu').set(as(waiter)).expect(200)).body.categories[0]
        .items[0] as {
        imageUrl: string | null;
      }
    ).imageUrl;

  it('stores a photo and serves it to anyone with long caching', async () => {
    const id = await dish();
    const res = await upload(id, JPEG).expect(200);
    expect(res.body.imageUrl).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.jpg$/);
    expect(existsSync(fileOf(res.body.imageUrl))).toBe(true);
    expect(await imageUrl()).toBe(res.body.imageUrl);

    const media = await ctx.http().get(res.body.imageUrl).expect(200);
    expect(media.headers['content-type']).toBe('image/jpeg');
    expect(media.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(media.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(media.body as Buffer, JPEG)).toBe(0);
    const audit = await ctx.prisma.auditEntry.findFirst({ where: { action: 'menu.item.image' } });
    expect(audit).not.toBeNull();
  });

  it('replaces and removes photos without leaving old ones behind', async () => {
    const id = await dish();
    const first = (await upload(id, JPEG).expect(200)).body.imageUrl as string;
    const second = (await upload(id, PNG, 'p.png').expect(200)).body.imageUrl as string;
    expect(second).not.toBe(first);
    await ctx.http().get(first).expect(404);
    expect(existsSync(fileOf(first))).toBe(false);
    expect(second).toMatch(/\.png$/);
    expect((await ctx.http().get(second).expect(200)).headers['content-type']).toBe('image/png');
    expect(await ctx.prisma.media.count()).toBe(1);

    const removed = await ctx
      .http()
      .delete(`/api/menu/items/${id}/image`)
      .set(as(owner))
      .expect(200);
    expect(removed.body.imageUrl).toBeNull();
    expect(await ctx.prisma.media.count()).toBe(0);
    expect(existsSync(fileOf(second))).toBe(false);
  });

  it('deletes the photo when the dish is archived', async () => {
    const id = await dish();
    await upload(id, JPEG).expect(200);
    await ctx.http().post(`/api/menu/items/${id}/archive`).set(as(owner)).expect(201);
    expect(await ctx.prisma.media.count()).toBe(0);
  });

  it('refuses files that are not photos, too big, or not allowed', async () => {
    const id = await dish();
    const text = await upload(id, Buffer.from('not really a jpeg'), 'fake.jpg').expect(400);
    expect(text.body.message).toBe('Use a JPEG, PNG or WebP photo.');
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1_100_000)]);
    const tooBig = await upload(id, big).expect(413);
    expect(tooBig.body.code).toBe('FILE_TOO_LARGE');
    await upload(id, JPEG, 'photo.jpg', waiter).expect(403);
    await ctx
      .http()
      .put('/api/menu/items/00000000-0000-4000-8000-000000000999/image')
      .set(as(owner))
      .attach('image', JPEG, 'photo.jpg')
      .expect(404);
    await ctx.http().get('/api/media/00000000-0000-4000-8000-000000000999.jpg').expect(404);
    await ctx.http().get('/api/media/..%2F..%2Fpackage.json').expect(404);
    await ctx.http().get('/api/media/notes.txt').expect(404);
    expect(await ctx.prisma.media.count()).toBe(0);
  });

  it('is not slowed down by the rate limit when a menu loads many photos', async () => {
    const id = await dish();
    const url = (await upload(id, JPEG).expect(200)).body.imageUrl as string;
    for (let i = 0; i < 320; i += 1) await ctx.http().get(url).expect(200);
  });
});
