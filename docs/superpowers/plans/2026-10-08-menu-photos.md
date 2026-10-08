# Dish Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners add a photo to a dish in Admin → Menu; customers see it on the QR menu.

**Architecture:** A `media` table stores small images (bytea) so backups cover them. The API takes a multipart upload per dish (type from magic bytes, ≤ 1 MB), serves `GET /api/media/:id` publicly with immutable caching, and adds `imageUrl` to menu views. The web editor shrinks photos in the browser (≤ 1024 px WebP) and uploads after saving the dish. The QR app shows thumbnails and a large photo.

**Tech Stack:** Prisma 6 + Postgres, NestJS 11 (Express, Multer via `FileInterceptor`), React 19 + TanStack Query (web, qr), Vitest, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-08-menu-photos-design.md`

## Global Constraints

- Allowed types by magic bytes only: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `52 49 46 46 ?? ?? ?? ?? 57 45 42 50`. Anything else → 400 `VALIDATION` "Use a JPEG, PNG or WebP photo.".
- Max stored size 1 MB (1,048,576 bytes) → else 413 `FILE_TOO_LARGE` "The photo is too big. Use one under 1 MB.". Multer limit 5 MB (nginx caps at 5 MB) so the friendly check runs in the service.
- `GET /api/media/:id`: public, skip throttling, headers `Content-Type` (stored), `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`.
- One photo per dish; replace/remove/archive delete the old `media` row in the same transaction; Duplicate does not copy photos.
- Browser shrink: longest side ≤ 1024 px; WebP 0.8, fallback JPEG 0.85.
- Commands: API e2e `pnpm --filter @rpos/api test:e2e -- <name>`; API unit `pnpm --filter @rpos/api test`; web/qr from their folder `npx vitest run <path>`; typecheck `npx tsc --noEmit -p tsconfig.json`; lint `pnpm lint` (root). Docker Postgres must be up (`docker compose up -d --wait postgres`).

## Review Focus

1. A file renamed `.jpg` that is really text or SVG → refused (type from bytes, never from name or header).
2. Replacing a photo twice quickly → exactly one `media` row left for the dish (no orphans).
3. QR customers (no sign-in) load photos; staff without `menu.manage` cannot upload.
4. A new dish with a photo chosen before first save → dish created once, photo attached; an upload failure does not create a second dish.
5. Many photos on one QR menu page → no 429 from the throttler.

Each is pinned by a test in Tasks 1–3.

---

### Task 1: Storage and API

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (+ new migration `<timestamp>_media`)
- Create: `apps/api/src/media/media.ts` (`detectImageType`), `apps/api/src/media/media.ts` test `apps/api/src/media/media.spec.ts`
- Create: `apps/api/src/media/media.controller.ts`, `apps/api/src/media/media.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `MediaModule`)
- Modify: `apps/api/src/menu/menu.views.ts` (`imageUrl`), `menu.controller.ts`, `menu.service.ts`
- Modify: `apps/api/src/qr/qr.service.ts` (`customerItem` passes `imageUrl`)
- Modify: `apps/api/package.json` (devDependency `@types/multer`)
- Test: `apps/api/test/menu-photos.e2e-spec.ts`

**Interfaces:**
- Produces: `detectImageType(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null`; routes `PUT/DELETE /api/menu/items/:id/image`, `GET /api/media/:id`; `imageUrl: string | null` on staff and QR menu items.

- [ ] **Step 1: Schema and migration**

In `schema.prisma` add:

```prisma
model Media {
  id        String   @id @default(uuid()) @db.Uuid
  outletId  String   @map("outlet_id") @db.Uuid
  mimeType  String   @map("mime_type")
  byteSize  Int      @map("byte_size")
  data      Bytes
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  outlet    Outlet   @relation(fields: [outletId], references: [id])
  items     Item[]

  @@map("media")
}
```

Add `media Media[]` to `Outlet`; to `Item` add

```prisma
  imageId     String?   @map("image_id") @db.Uuid
  image       Media?    @relation(fields: [imageId], references: [id], onDelete: SetNull)
```

Run (from `apps/api`): `pnpm exec prisma migrate dev --name media` (creates and applies the migration on the dev DB, regenerates the client). Commit the migration folder.

- [ ] **Step 2: Write the failing tests**

`src/media/media.spec.ts`:

```ts
import { detectImageType } from './media';

const bytes = (...b: number[]) => Buffer.from(b);

describe('detectImageType', () => {
  it('reads JPEG, PNG and WebP from their first bytes', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('image/jpeg');
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(
      detectImageType(Buffer.concat([Buffer.from('RIFF'), bytes(1, 2, 3, 4), Buffer.from('WEBPVP8 ')])),
    ).toBe('image/webp');
  });

  it('refuses everything else', () => {
    expect(detectImageType(Buffer.from('hello, I am text'))).toBeNull();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from('RIFF1234WAVE'))).toBeNull();
  });
});
```

`test/menu-photos.e2e-spec.ts` (model the setup on `test/menu.e2e-spec.ts`: outlet, station, tax, owner and waiter tokens, `category()`, `itemBody()`):

```ts
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
      (await ctx.http().get('/api/menu').set(as(waiter)).expect(200)).body.categories[0].items[0] as {
        imageUrl: string | null;
      }
    ).imageUrl;

  it('stores a photo and serves it to anyone with long caching', async () => {
    const id = await dish();
    const res = await upload(id, JPEG).expect(200);
    expect(res.body.imageUrl).toMatch(/^\/api\/media\/[0-9a-f-]{36}$/);
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
    expect((await ctx.http().get(second).expect(200)).headers['content-type']).toBe('image/png');
    expect(await ctx.prisma.media.count()).toBe(1);

    const removed = await ctx.http().delete(`/api/menu/items/${id}/image`).set(as(owner)).expect(200);
    expect(removed.body.imageUrl).toBeNull();
    expect(await ctx.prisma.media.count()).toBe(0);
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
    await ctx.http().get('/api/media/00000000-0000-4000-8000-000000000999').expect(404);
    expect(await ctx.prisma.media.count()).toBe(0);
  });

  it('is not slowed down by the rate limit when a menu loads many photos', async () => {
    const id = await dish();
    const url = (await upload(id, JPEG).expect(200)).body.imageUrl as string;
    for (let i = 0; i < 320; i += 1) await ctx.http().get(url).expect(200);
  });
});
```

Also add to the existing QR menu e2e (find it with `grep -ln "qr/menu" apps/api/test`) a check that an item returned by `GET /api/qr/menu` has `imageUrl: null` by default (add the key to the expected object if the test uses `toEqual`).

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @rpos/api test -- media` and `pnpm --filter @rpos/api test:e2e -- menu-photos`
Expected: FAIL — `./media` missing; routes 404.

- [ ] **Step 4: `src/media/media.ts`**

```ts
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Largest photo we keep: the browser shrinks photos well below this. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

const startsWith = (bytes: Buffer, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((b, i) => bytes[offset + i] === b);

/** The image type from the file's own first bytes; null for anything we do not store. */
export function detectImageType(bytes: Buffer): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  return null;
}
```

- [ ] **Step 5: `media.controller.ts` and module**

```ts
import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators';
import { notFound } from '../common/master-data';
import { PrismaService } from '../prisma/prisma.service';

/** Photos for menus. Public: QR customers are not signed in; ids are random and never reused. */
@Controller('media')
export class MediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  @Public()
  @SkipThrottle()
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw notFound('Photo');
    res
      .status(200)
      .set({
        'Content-Type': media.mimeType,
        'Content-Length': String(media.byteSize),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .end(Buffer.from(media.data));
  }
}
```

```ts
import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';

@Module({ controllers: [MediaController] })
export class MediaModule {}
```

Import `MediaModule` in `app.module.ts`. Check `PrismaService` is globally provided (it is used by other modules without importing a Prisma module; if not, import the module that exports it). Check the `Public` and `SkipThrottle` names (`grep -n "export const Public" src/auth/decorators.ts`).

- [ ] **Step 6: Menu views and QR**

`menu.views.ts` `itemView`: add `imageUrl: item.imageId ? `/api/media/${item.imageId}` : null,` after `isCombo`. `qr.service.ts` `customerItem`: add `imageUrl: item.imageUrl,` after `foodType`.

- [ ] **Step 7: Menu routes and service**

Install: `pnpm --filter @rpos/api add -D @types/multer`.

`menu.controller.ts`:

```ts
import { Delete, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
```

```ts
  @Put('items/:id/image')
  @RequirePermissions('menu.manage')
  // 5 MB here (nginx's cap); the service turns anything over 1 MB into a friendly 413.
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  setItemImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.menu.setItemImage(user, id, file?.buffer);
  }

  @Delete('items/:id/image')
  @RequirePermissions('menu.manage')
  removeItemImage(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.removeItemImage(user, id);
  }
```

`menu.service.ts` (imports `detectImageType`, `MAX_IMAGE_BYTES` from `../media/media`):

```ts
  /** Sets a dish's photo; the old one is deleted with it. */
  async setItemImage(actor: AuthUser, id: string, bytes: Buffer | undefined) {
    const item = await this.prisma.item.findFirst({
      where: { id, outletId: actor.outletId, archivedAt: null },
    });
    if (!item) throw notFound('Item');
    if (bytes && bytes.length > MAX_IMAGE_BYTES) {
      throw new ApiError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'FILE_TOO_LARGE',
        'The photo is too big. Use one under 1 MB.',
      );
    }
    const mimeType = bytes ? detectImageType(bytes) : null;
    if (!bytes || !mimeType) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Use a JPEG, PNG or WebP photo.');
    }
    await this.prisma.$transaction(async (tx) => {
      const media = await tx.media.create({
        data: { outletId: actor.outletId, mimeType, byteSize: bytes.length, data: bytes },
      });
      await tx.item.update({ where: { id }, data: { imageId: media.id } });
      if (item.imageId) await tx.media.delete({ where: { id: item.imageId } });
    });
    await this.record(actor, 'menu.item.image', 'item', id, undefined, {
      item: item.name,
      action: 'set',
      bytes: bytes.length,
    });
    return this.loadItem(id);
  }

  async removeItemImage(actor: AuthUser, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, outletId: actor.outletId, archivedAt: null },
    });
    if (!item) throw notFound('Item');
    if (item.imageId) {
      const imageId = item.imageId;
      await this.prisma.$transaction([
        this.prisma.item.update({ where: { id }, data: { imageId: null } }),
        this.prisma.media.delete({ where: { id: imageId } }),
      ]);
      await this.record(actor, 'menu.item.image', 'item', id, undefined, {
        item: item.name,
        action: 'remove',
      });
    }
    return this.loadItem(id);
  }
```

In `archiveItem`, replace the single `update` with:

```ts
    await this.prisma.$transaction([
      this.prisma.item.update({ where: { id }, data: { archivedAt: new Date(), imageId: null } }),
      ...(item.imageId ? [this.prisma.media.delete({ where: { id: item.imageId } })] : []),
    ]);
```

(`loadItem` already exists and returns the item view; `ApiError`/`HttpStatus` are already imported in this file.)

- [ ] **Step 8: Run to verify they pass**

Run: `pnpm --filter @rpos/api test` and `pnpm --filter @rpos/api test:e2e` (whole suite).
Expected: PASS. Typecheck `pnpm --filter @rpos/api exec tsc --noEmit`.

- [ ] **Step 9: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): dish photos stored with the menu and served to QR customers"
```

---

### Task 2: Web — upload from the dish editor

**Files:**
- Modify: `apps/web/src/shared/api/http.ts` (FormData bodies) + `http.test.ts`
- Create: `apps/web/src/features/menu/photo.ts` (`fitWithin`, `shrinkPhoto`) + `photo.test.ts`
- Modify: `apps/web/src/features/menu/types.ts` (`imageUrl: string | null` on `MenuItem`), `api.ts`, `mutations.ts`
- Modify: `apps/web/src/features/menu/components/ItemEditor.tsx`, `components/ItemRow.tsx`
- Test: `apps/web/src/features/menu/pages/MenuPages.test.tsx`

**Interfaces:**
- Produces: `fitWithin(width: number, height: number, max: number): { width: number; height: number }`; `shrinkPhoto(file: File): Promise<Blob>`; `setItemPhoto(itemId: string, photo: Blob): Promise<MenuItem>`; `removeItemPhoto(itemId: string): Promise<MenuItem>`; `useItemPhoto()` (mutation over `{ itemId, photo: Blob | null }`); `useSaveItem(existing, onSaved: (saved: MenuItem) => void)`.

- [ ] **Step 1: Write the failing tests**

`http.test.ts` (append):

```ts
  it('sends FormData as it is, without a JSON content type', async () => {
    const mock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mock);
    const form = new FormData();
    form.append('image', new Blob(['x'], { type: 'image/webp' }), 'photo.webp');
    await apiFetch('/api/menu/items/i1/image', { method: 'PUT', body: form });
    const init = mock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).get('Content-Type')).toBeNull();
  });
```

(Use the file's existing imports/helpers; add `vi` and `apiFetch` imports if missing.)

`photo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fitWithin } from './photo';

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });
  it('leaves small photos alone', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });
});
```

`MenuPages.test.tsx` — at the top, mock the shrinker (jsdom has no canvas):

```ts
vi.mock('../photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../photo')>()),
  shrinkPhoto: vi.fn(async () => new Blob(['small'], { type: 'image/webp' })),
}));
```

(add `vi` to the vitest import) and tests:

```tsx
  it('adds a photo to a new dish after saving it', async () => {
    asManager();
    const mock = baseApi({
      'POST /api/menu/items': ({ body }) => json({ id: 'i9', ...(body as object), imageUrl: null }, 201),
      'PUT /api/menu/items/i9/image': () => json({ id: 'i9', imageUrl: '/api/media/m1' }),
    });
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Lassi' } });
    setVariant(1, 'Regular', '60');
    const file = new File(['big'], 'lassi.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Add photo'), { target: { files: [file] } });
    expect(await screen.findByRole('img', { name: 'Photo of Lassi' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await expect.poll(() => callsTo(mock, 'PUT', '/api/menu/items/i9/image').length).toBe(1);
    expect(callsTo(mock, 'POST', '/api/menu/items')).toHaveLength(1);
    const sent = callsTo(mock, 'PUT', '/api/menu/items/i9/image')[0]![1]!.body;
    expect(sent).toBeInstanceOf(FormData);
    expect((sent as FormData).get('image')).toBeInstanceOf(Blob);
  });

  it('removes a dish photo', async () => {
    asManager();
    const withPhoto = {
      ...menu,
      categories: [
        {
          ...menu.categories[0]!,
          items: menu.categories[0]!.items.map((i, n) =>
            n === 0 ? { ...i, imageUrl: '/api/media/m1' } : i,
          ),
        },
      ],
    };
    const mock = baseApi({
      'GET /api/menu': () => json(withPhoto),
      'PUT /api/menu/items/i1': ({ body }) => json({ id: 'i1', ...(body as object) }),
      'DELETE /api/menu/items/i1/image': () => json({ id: 'i1', imageUrl: null }),
    });
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' , exact: false } as never));
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await expect.poll(() => callsTo(mock, 'DELETE', '/api/menu/items/i1/image').length).toBe(1);
  });

  it('keeps the dish saved and says so when the photo fails', async () => {
    asManager();
    baseApi({
      'POST /api/menu/items': ({ body }) => json({ id: 'i9', ...(body as object), imageUrl: null }, 201),
      'PUT /api/menu/items/i9/image': () =>
        json({ code: 'FILE_TOO_LARGE', message: 'The photo is too big. Use one under 1 MB.' }, 413),
    });
    renderRoute('/admin/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Lassi' } });
    setVariant(1, 'Regular', '60');
    fireEvent.change(screen.getByLabelText('Add photo'), {
      target: { files: [new File(['x'], 'l.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    expect(
      await screen.findByText('Lassi is saved, but its photo was not: The photo is too big. Use one under 1 MB.'),
    ).toBeInTheDocument();
  });
```

For the "Edit" click in the remove test use the first dish's Edit button: `screen.getAllByRole('button', { name: 'Edit' })[0]` after awaiting `findByText('Veg Soup')` (adapt the line accordingly). Give the fixture items `imageUrl: null` so types match.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/shared/api src/features/menu`
Expected: FAIL — JSON content type sent for FormData, `./photo` missing, no "Add photo" control.

- [ ] **Step 3: `http.ts`**

In `send()` replace the two body lines:

```ts
    // FormData sets its own multipart content type (with the boundary).
    const isForm = request.body instanceof FormData;
    if (request.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    return fetch(path, {
      method: request.method ?? 'GET',
      credentials: 'include',
      headers,
      body:
        request.body === undefined
          ? undefined
          : isForm
            ? (request.body as FormData)
            : JSON.stringify(request.body),
    });
```

- [ ] **Step 4: `photo.ts`**

```ts
const MAX_SIDE = 1024;

/** The size that fits within `max` on its longest side, keeping the shape; never larger. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * A phone photo made small enough to upload quickly: longest side 1024 px, WebP (JPEG where the
 * browser cannot write WebP). Rejects with a plain message if the file is not a readable image.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Could not read this photo.');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not read this photo.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = await encode(canvas, 'image/webp', 0.8);
  if (webp && webp.type === 'image/webp' && webp.size > 0) return webp;
  const jpeg = await encode(canvas, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('Could not read this photo.');
  return jpeg;
}
```

- [ ] **Step 5: Types, API, mutations**

`types.ts` `MenuItem`: `imageUrl: string | null;`.

`api.ts`:

```ts
export const setItemPhoto = (itemId: string, photo: Blob) => {
  const form = new FormData();
  form.append('image', photo, photo.type === 'image/jpeg' ? 'photo.jpg' : 'photo.webp');
  return apiFetch<MenuItem>(`/api/menu/items/${itemId}/image`, { method: 'PUT', body: form });
};

export const removeItemPhoto = (itemId: string) =>
  apiFetch<MenuItem>(`/api/menu/items/${itemId}/image`, { method: 'DELETE' });
```

Type `saveItem` as returning `Promise<MenuItem>` (`apiFetch<MenuItem>(…)` on both branches).

`mutations.ts`: `useSaveItem(existing: MenuItem | null, onSaved: (saved: MenuItem) => void)` (pass `onSuccess: onSaved`), and

```ts
/** Sets (a Blob) or removes (null) a dish's photo; the menu refreshes after. */
export const useItemPhoto = () =>
  useInvalidatingMutation({
    mutationFn: ({ itemId, photo }: { itemId: string; photo: Blob | null }) =>
      photo ? setItemPhoto(itemId, photo) : removeItemPhoto(itemId),
    invalidates: [menuKeys.all],
  });
```

- [ ] **Step 6: `ItemEditor` photo section**

State and flow:

```tsx
type PhotoChange = { kind: 'keep' } | { kind: 'set'; file: File; preview: string } | { kind: 'remove' };

  const notify = useNotify();
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoMutation = useItemPhoto();
  useEffect(
    () => () => {
      if (photo.kind === 'set') URL.revokeObjectURL(photo.preview);
    },
    [photo],
  );

  async function afterSave(saved: MenuItem) {
    if (photo.kind === 'keep') return onDone();
    setPhotoBusy(true);
    try {
      const blob = photo.kind === 'set' ? await shrinkPhoto(photo.file) : null;
      await photoMutation.mutateAsync({ itemId: saved.id, photo: blob });
    } catch (error) {
      // The dish is saved; only the photo failed. Close and say so rather than risk a second save.
      notify({
        text: `${saved.name} is saved, but its photo was not: ${describeError(error)}`,
        tone: 'warning',
        ttlMs: 15_000,
      });
    } finally {
      setPhotoBusy(false);
    }
    onDone();
  }
  const save = useSaveItem(existing, (saved) => void afterSave(saved));
```

Shown photo: `const shown = photo.kind === 'set' ? photo.preview : photo.kind === 'remove' ? null : (existing?.imageUrl ?? null);`

Markup above the Sizes section:

```tsx
      <section aria-label="Photo" className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-subtle">
          {shown ? (
            <img src={shown} alt={`Photo of ${name.trim() || 'this dish'}`} className="size-full object-cover" />
          ) : (
            <ImageIcon aria-hidden="true" className="size-8" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className={`${secondaryButton} min-h-11 cursor-pointer`}>
            {shown ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept="image/*"
              aria-label={shown ? 'Change photo' : 'Add photo'}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhoto({ kind: 'set', file, preview: URL.createObjectURL(file) });
                e.target.value = '';
              }}
            />
          </label>
          {shown && (
            <button type="button" className={secondaryButton} onClick={() => setPhoto({ kind: 'remove' })}>
              Remove photo
            </button>
          )}
          <p className="text-xs text-muted">Shown to customers on the QR menu. Square photos look best.</p>
        </div>
      </section>
```

Imports: `ImageIcon` from `lucide-react` (`Image as ImageIcon`), `useNotify` from `@/features/notifications`, `useItemPhoto` from `../mutations`, `shrinkPhoto` from `../photo`, `describeError` from `@/shared/ui`, `useEffect`. Save button: `disabled={save.isPending || photoBusy}` and label stays "Save item".

jsdom lacks `URL.createObjectURL`: in the test file's top (or `src/test/setup.ts`), add `URL.createObjectURL ??= () => 'blob:preview'; URL.revokeObjectURL ??= () => undefined;` (prefer setup.ts next to the other shims).

- [ ] **Step 7: `ItemRow` thumbnail**

Before the food dot:

```tsx
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              className="size-10 shrink-0 rounded-md object-cover"
            />
          )}
```

- [ ] **Step 8: Run, typecheck, lint, commit**

Run: `npx vitest run`, `npx tsc --noEmit -p tsconfig.json`, `pnpm lint` (root). All green; fix every fixture `MenuItem` that now lacks `imageUrl` by adding `imageUrl: null`.

```bash
git add apps/web
git commit -m "feat(web): add, change and remove dish photos in the menu editor"
```

---

### Task 3: QR app — show photos

**Files:**
- Modify: `apps/qr/src/features/menu/types.ts` (`imageUrl: string | null` on `MenuItem`)
- Modify: `apps/qr/src/features/menu/components/Menu.tsx`, `ItemSheet.tsx`
- Test: the QR menu component tests (`grep -ln "Menu\b\|ItemSheet" apps/qr/src --include=*.test.tsx`)

- [ ] **Step 1: Failing tests** (add to the existing Menu/ItemSheet test file; give fixtures `imageUrl`)

```tsx
  it('shows a dish photo when there is one, and nothing when there is not', () => {
    // Render the menu with two dishes: one with imageUrl '/api/media/m1', one with null.
    // Expect exactly one <img> with src '/api/media/m1', loading 'lazy' and empty alt in the list.
  });

  it('shows the large photo in the dish sheet, named for the dish', () => {
    // Open the sheet for the dish with a photo; expect getByRole('img', { name: '<dish name>' })
    // with src '/api/media/m1'.
  });
```

Write these with the file's own render helpers and fixture shape (the plan cannot know them; read the test file first and follow it exactly).

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/features/menu` in `apps/qr`.

- [ ] **Step 3: Implement**

`Menu.tsx`, inside the row button, after the price span:

```tsx
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt=""
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  className="size-16 shrink-0 rounded-lg object-cover"
                />
              )}
```

and wrap price + photo so the row stays `justify-between` (price then photo on the right).

`ItemSheet.tsx`, first child inside the sheet when `item.imageUrl`:

```tsx
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="aspect-video w-full rounded-xl object-cover"
        />
      )}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx vitest run` and `npx tsc --noEmit -p tsconfig.json` in `apps/qr`; `pnpm lint` (root).

```bash
git add apps/qr
git commit -m "feat(qr): show dish photos on the customer menu"
```

---

### Task 4: Real-app check

- [ ] **Step 1:** With api, web and qr running: Admin → Menu → edit Paneer Tikka → Add photo (a real phone-size JPEG) → Save; check the thumbnail in Admin, check the request was well under 1 MB (Network panel), then open the QR menu for a table and check the thumbnail and the sheet photo. Remove the photo and check it disappears.
- [ ] **Step 2:** Commit any fix with a message naming it.
