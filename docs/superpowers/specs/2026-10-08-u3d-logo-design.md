# U3d — Restaurant logo

Last part of U3. Builds on dish photos (`docs/superpowers/specs/2026-10-08-menu-photos-design.md`):
the same storage (Cloudflare R2, or a local folder without R2 settings).

## 1. Purpose

The app shows the restaurant only as text. An owner wants their logo where staff and customers see
the brand: the staff app header, printed bills and the customer QR menu.

**Success looks like:**
- Admin → Settings has a **Logo** section: add, change or remove, with a preview; a phone photo or a
  PNG with a transparent background both work.
- The staff app header shows the logo next to the outlet name.
- Printed bills (browser printing) show the logo centred at the top, sized for an 80 mm or 58 mm
  roll, in greyscale; the print payload for the print agent carries `outlet.logoUrl` too.
- The customer QR menu header shows the logo next to the restaurant name.
- No logo → everything looks as today.

**Out of scope:** logo on KOTs, favicon/app icon, colour theming from the logo, ESC/POS raster
conversion inside this repo (the print agent decides how to print `logoUrl`).

## 2. Decisions

| Question | Choice |
|---|---|
| Where shown | Staff header, printed bills, QR menu header (decided; the user delegates design choices). |
| Storage | Same `media` table and `MediaStorage` (R2 or local). `Outlet` gains `logoId`. |
| Shared code | A `MediaService` (API) owns "store a new image, swap it in, delete the old one" with the R2-safe ordering from dish photos (object first, rows in a transaction, remove the new object if the rows fail, remove the old object after commit). Dish photos move onto it; behaviour unchanged. |
| Size in the browser | Logo shrunk to longest side ≤ 512 px (WebP keeps transparency; JPEG fallback gets a white background). Same 1 MB server limit and byte check. |
| Bills | `<img>` at the top of the browser ticket, `max-height: 18mm`, `max-width: 60%`, `filter: grayscale(1)`; the print frame's load event already waits for images, so printing waits for the logo (a broken logo URL does not block printing). |

## 3. Data

`Outlet`: `logoId String? @map("logo_id") @db.Uuid`, relation `logo Media?` (`onDelete: SetNull`).
`Media` gains the back-relation `outlets Outlet[]`.

Views: outlet settings (`GET /api/outlet`) gain `logoUrl: string | null`; QR session start
(`POST /api/qr/sessions`) returns `outlet: { name, logoUrl }`; the bill print payload's `outlet`
gains `logoUrl`. With local storage `logoUrl` is relative (`/api/media/<key>`); a print agent must
join it with its API base URL. With R2 it is absolute.

## 4. API

- `PUT /api/outlet/logo` — `settings.manage`, multipart field `image`; same checks and errors as
  dish photos (`FILE_TOO_LARGE`, "Use a JPEG, PNG or WebP photo."). Audit `outlet.logo` `{ action:
  'set', bytes }`. Returns the outlet settings view.
- `DELETE /api/outlet/logo` — `settings.manage`; audit `{ action: 'remove' }`; returns the settings
  view. No logo → 200 unchanged.
- `MediaService` (in `src/media`):
  - `store(outletId, bytes): Promise<{ id, key }>` — checks size/type, puts the object, creates the
    row; deletes the object if the row fails.
  - `discard(key)` — removes an object nobody points at; logs failures, never throws.
  - Callers (dish photo, logo) run: `store` → their own transaction that points at the new row and
    deletes the old row → `discard(oldKey)`; if their transaction fails they `discard(newKey)`.
  - `urlFor(key)` — the public URL.
- `MenuService` dish photos use `MediaService` (no behaviour change; existing tests stay green).

## 5. Web (staff app)

- Settings page: **Logo** section at the top — 80 px preview box (`object-contain` on a checker-free
  light background), **Add logo** / **Change logo** (file input `accept="image/*"`, shrunk with
  `shrinkPhoto(file, 512)`), **Remove logo**. Uploads immediately on pick (no separate Save), with a
  spinner and an error note; success toast "Logo saved".
- `shrinkPhoto(file, maxSide = 1024)` gains the size parameter.
- `AppShell` header: logo (32 px square in the header, 36 px in the sidebar, `object-contain`, `alt=""`) before the outlet name when set.
- Bill template (`billTicket.ts`): logo image at the top when `outlet.logoUrl` is set; the URL is
  escaped like other values. Relative URLs (`/api/media/…`, local storage) are made absolute against
  `window.location.origin` so the iframe document resolves them.

## 6. QR app

- Session type gains `outlet.logoUrl`; the header shows the logo in a 48 px icon square before the restaurant name
  (`alt=""`, the name follows).

## 7. Tests

- API e2e: set/replace/remove the logo (file removed from the local folder each time), settings
  view and QR session show `logoUrl`, bill print payload includes it, cashier → 403, wrong type →
  400, too big → 413; dish photo e2e still green after the `MediaService` refactor.
- API unit: `MediaService.store` removes the new object when the row insert fails; `discard`
  swallows storage errors.
- Web: Settings logo add/remove calls the API and shows the preview; header shows the logo; bill
  template renders the logo with an absolute URL and leaves it out when null; `shrinkPhoto`'s
  `fitWithin` respects 512.
- QR: header logo shown when set, absent otherwise.
- Real browser: upload a logo, see it in the header, print a bill preview (browser print) with it.
