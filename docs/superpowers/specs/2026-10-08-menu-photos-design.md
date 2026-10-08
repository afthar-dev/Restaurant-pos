# Dish photos

Requested by the user on 2026-10-08 ("add the image upload option for menu items"). The user chose
to show photos on the **customer QR menu** (plus Admin for managing them). The storage built here
is also what the later restaurant-logo work (U3d) will use.

## 1. Purpose

Customers ordering from the table QR see only names and prices. A photo per dish helps them
choose and sells more. Owners need to add, change and remove photos from Admin → Menu, often
from a phone.

**Success looks like:**
- In the dish editor an owner taps **Add photo**, picks a picture or takes one with the phone
  camera, sees a preview, and saves. New dishes can get a photo before their first save.
- The QR menu shows a thumbnail next to each dish that has a photo and a large photo in the dish
  sheet. Dishes without a photo look as today.
- Uploads are small and quick on shop Wi-Fi; photos load fast and are cached by phones.
- Photos are part of the nightly database backup and the restore drill with no new setup.
- Only real JPEG, PNG or WebP images are stored; nothing else can be uploaded or served.

**Out of scope:** photos on POS/captain tiles, more than one photo per dish, cropping UI, the
restaurant logo (U3d, which reuses this storage), CDN.

## 2. Decisions

| Question | Choice |
|---|---|
| Where shown | QR menu list and dish sheet; Admin dish editor and dish rows (user). |
| Resizing | In the browser before upload: longest side ≤ 1024 px, WebP at quality 0.8 (JPEG 0.85 where WebP encoding is unavailable). No native image library on the server. |
| Storage | Postgres table `media` (`bytea`), so pg_dump backups and the restore check include photos. ~50–200 kB per photo. |
| Serving | `GET /api/media/:id`, public, `Cache-Control: public, max-age=31536000, immutable`; a new upload always gets a new id. |
| Server checks | Upload ≤ 1 MB; type decided from the file's first bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`), not from the client's header; anything else → 400. |
| Old photos | Replacing or removing a photo deletes the old `media` row; archiving a dish deletes its photo. |
| Duplicate | Does not copy the photo (a photo belongs to one dish). |

## 3. Data

New Prisma model and migration:

```prisma
model Media {
  id        String   @id @default(uuid()) @db.Uuid
  outletId  String   @map("outlet_id") @db.Uuid
  mimeType  String   @map("mime_type")   // image/jpeg | image/png | image/webp
  byteSize  Int      @map("byte_size")
  data      Bytes
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  outlet    Outlet   @relation(fields: [outletId], references: [id])
  items     Item[]
  @@map("media")
}
```

`Item` gains `imageId String? @map("image_id") @db.Uuid` with relation `image Media?`
(`onDelete: SetNull`).

Menu views (`GET /api/menu` and the QR menu) gain `imageUrl: string | null` per item
(`/api/media/<id>` or null).

## 4. API

- `PUT /api/menu/items/:id/image` — `menu.manage`, multipart field `image` (Multer memory
  storage, limit 1 MB). Checks the item is active and in the outlet, detects the type from the
  bytes, stores a new `media` row, points the item at it, deletes the previous one, all in one
  transaction. Audit `menu.item.image` with `{ item, action: 'set', bytes }`. Returns the item
  view.
- `DELETE /api/menu/items/:id/image` — `menu.manage`; clears the item's image and deletes the
  row; audit `{ action: 'remove' }`; returns the item view. No photo → 200 unchanged.
- `GET /api/media/:id` — public (no auth guard), UUID pipe. 200 with the stored `Content-Type`,
  `Content-Length`, the immutable cache header and `X-Content-Type-Options: nosniff`; unknown
  id → 404. Only `media` rows are reachable; ids are random UUIDs.
- `archiveItem` also deletes the item's photo.
- Errors: too big → 413 `FILE_TOO_LARGE` "The photo is too big. Use one under 1 MB.";
  wrong type or empty → 400 `VALIDATION` "Use a JPEG, PNG or WebP photo."; missing item → 404.

## 5. Web (Admin)

- `features/menu/photo.ts`: `shrinkPhoto(file: File): Promise<Blob>` — decodes with
  `createImageBitmap`, draws on a canvas scaled so the longest side ≤ 1024 px, encodes WebP 0.8,
  falls back to JPEG 0.85 if the WebP blob comes back as PNG/empty. Files that are not images or
  fail to decode reject with "Could not read this photo.".
- `ItemEditor` gets a **Photo** section above Sizes:
  - Current photo (from `imageUrl`) or the picked preview, 96 px square, `object-cover`.
  - **Add photo** / **Change photo**: a file input `accept="image/*"` (phones offer camera and
    gallery), visually a button; **Remove photo** when there is one.
  - The photo change is held until **Save item**: after the item save succeeds, the editor uploads
    the shrunk photo (`PUT …/image`) or removes it (`DELETE …/image`). New dishes use the id the
    create returned.
  - While uploading, Save shows its spinner; an upload error keeps the editor open with the
    message, the dish itself already saved.
- `ItemRow` shows a 40 px thumbnail when the dish has a photo.

## 6. QR app

- `features/menu` types gain `imageUrl`.
- `Menu.tsx` list rows: when `imageUrl` is set, a 64 px rounded thumbnail on the right side,
  `loading="lazy"`, `decoding="async"`, fixed width/height so nothing jumps, `alt=""` (the row
  already names the dish).
- `ItemSheet.tsx`: a 16:9 photo at the top (`object-cover`, `alt` = dish name) when set.

## 7. Tests

- API e2e: upload JPEG/PNG/WebP (tiny fixtures built in the test) → menu shows `imageUrl`;
  `GET /api/media/:id` returns the bytes with type and cache headers, no auth; replacing deletes
  the old row; remove clears it; archiving the dish deletes it; text file with `.jpg` name → 400;
  over 1 MB → 413; other outlet's item → 404; waiter → 403; QR menu includes `imageUrl`.
- Web: `shrinkPhoto` scales the longest side to 1024 (canvas mocked) and keeps small images;
  editor picks a photo, shows the preview, saves the item then uploads; remove sends DELETE;
  upload error message; thumbnail in `ItemRow`.
- QR: thumbnail and sheet photo render when `imageUrl` is set and not otherwise.
- Real browser: upload a phone-size JPEG, see it on the QR menu.
