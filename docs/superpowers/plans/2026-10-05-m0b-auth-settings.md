# M0b Auth, Roles, Settings & Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can sign in (owner/manager with phone + password; cashier/waiter with a PIN on a registered device), every API route is protected by role permissions, the owner can manage staff, devices and outlet settings, sensitive actions are audited, and the production stack has nightly backups and an HTTPS deploy runbook.

**Architecture:** New NestJS modules `auth`, `users`, `devices`, `outlet`, `audit`. A global `AccessGuard` verifies a 15-minute JWT access token (unless a route is `@Public()`); a global `PermissionsGuard` checks `@RequirePermissions(...)` against the role → permission map in `@rpos/shared`, with an optional short-lived manager override token. Refresh tokens and device tokens are opaque random values stored as SHA-256 hashes and delivered as httpOnly cookies. The web app keeps the access token in memory (Zustand), restores the session through `/api/auth/refresh` on load, and retries once on 401.

**Tech Stack:** adds `@nestjs/jwt`, `@nestjs/throttler`, `@node-rs/argon2`, `cookie-parser`, `helmet` (api); `zustand` (web).

**Spec:** `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md` — sections 6.1 (permission matrix), 6.2 (authentication), 6.3 (audit), 6.4 (security baseline), 7.2, 9 (M0).

**Out of scope:** Socket.IO gateway and KDS screen (M2), menu/tables (M1), using override tokens inside billing actions (M3 — this plan ships the mechanism).

## Global Constraints

- Everything from the M0a plan's Global Constraints still applies (Node 24, pnpm 10.17.1, `@rpos/*`, snake_case tables, UUID keys, paise, `/api` prefix, English, LF, commit trailer).
- Passwords and PINs hashed with argon2 (`@node-rs/argon2`). Never log or return hashes, tokens, PINs or passwords.
- Access token: HS256 JWT, 15 minutes, secret from `JWT_SECRET` (≥ 32 chars).
- Refresh token: 32 random bytes (base64url), SHA-256 stored, cookie `rpos_rt`, `httpOnly`, `sameSite=strict`, `path=/api/auth`, `secure` in production. Absolute (non-sliding) lifetime: 7 days for password logins, 12 hours for PIN logins. Rotated on every refresh; reuse of a rotated token revokes the whole token family.
- Device token: 32 random bytes, SHA-256 stored, cookie `rpos_dt`, `httpOnly`, `sameSite=strict`, `path=/api`, `secure` in production, max-age 400 days.
- Lockout: 5 consecutive failed password or PIN attempts lock that user for 15 minutes.
- Indian mobile numbers: 10 digits starting 6–9.
- Permission matrix follows spec §6.1 exactly; waiter bill/payment permissions depend on the outlet setting `waiterCanCollectPayment`.

## Review Focus

1. **Refresh token replay** — reusing an already-rotated refresh token must fail and revoke the family, so a stolen cookie stops working for both parties. Pinned in Task 3 (`auth.e2e-spec.ts` reuse test).
2. **Brute-forcing a 4-digit PIN** — the 6th attempt must be refused even with the correct PIN, and per-IP throttling caps request rate. Pinned in Task 4 (lockout e2e) and Task 5 (throttle config).
3. **Archived or demoted staff keep access** — an archived user must not log in, refresh, or use an existing access token beyond its 15 minutes; the last owner cannot be archived or demoted. Pinned in Task 5 (users e2e).
4. **Cookie / token leakage** — API responses never include hashes; tokens are never in URLs or logs. Pinned in Task 5 (`users` responses checked for `passwordHash`/`pinHash`).
5. **Session lost on reload or a 401 storm** — reload restores the session from the refresh cookie; concurrent 401s trigger exactly one refresh. Pinned in Task 6 (`apiFetch` single-flight test).

---

## File Structure

```
packages/shared/src/
  auth.ts                 roles, permissions, ROLE_PERMISSIONS, permissionsFor(), hasPermission()
  auth.test.ts
  schemas.ts              Zod request schemas: login, pinLogin, override, createUser, updateUser,
                          outletSettings, registerDevice; phone + pin validators
  schemas.test.ts
apps/api/
  prisma/schema.prisma    + Role, DeviceType, ParcelPaymentTiming enums; User, Device,
                          RefreshSession, AuditEntry models; Outlet settings columns
  prisma/seed.ts          + owner from OWNER_NAME / OWNER_PHONE / OWNER_PASSWORD
  src/common/
    zod-body.pipe.ts      ZodValidationPipe → 400 {code:'VALIDATION', message, details}
    crypto.ts             randomToken(), sha256()
    current-user.ts       @CurrentUser() decorator + AuthUser type
  src/auth/
    auth.module.ts
    password.service.ts   hash/verify (argon2)
    token.service.ts      access JWT sign/verify, override JWT sign/verify
    session.service.ts    refresh sessions: create, rotate (reuse detection), revoke family
    lockout.ts            recordFailure/recordSuccess/isLocked helpers
    auth.service.ts       login, pinLogin, refresh, logout, me, issueOverride
    auth.controller.ts    /api/auth/*
    cookies.ts            cookie names + options
    public.decorator.ts   @Public()
    access.guard.ts       global JWT guard
    permissions.decorator.ts  @RequirePermissions()
    permissions.guard.ts  global permission guard (+ override header)
  src/devices/            devices.module/service/controller, device.guard.ts
  src/users/              users.module/service/controller
  src/outlet/             outlet.module/service/controller
  src/audit/              audit.module/service/controller
  test/                   auth.e2e-spec.ts, devices.e2e-spec.ts, users.e2e-spec.ts,
                          outlet.e2e-spec.ts, helpers.ts (createTestApp, resetDb, loginAs)
apps/web/src/
  auth/store.ts           Zustand session store
  auth/api.ts             apiFetch (bearer, single-flight refresh, retry once)
  auth/api.test.ts
  auth/RequireAuth.tsx    route guard by permission
  auth/useBootSession.ts  restore session on load
  pages/LoginPage.tsx (+ test)   phone + password
  pages/PinPage.tsx (+ test)     staff list + PIN pad on registered device
  pages/admin/StaffPage.tsx (+ test)
  pages/admin/SettingsPage.tsx (+ test)
  pages/admin/DevicesPage.tsx (+ test)
  pages/admin/AuditPage.tsx
  routes.tsx              + /login, /pin, /admin/* nested routes, guards
docker/backup/Dockerfile, docker/backup/backup.sh
docker-compose.prod.yml   + JWT_SECRET, OWNER_* passthrough, backup service
docker-compose.tls.yml    TLS overlay (certbot webroot + nginx 443)
docker/nginx/tls.conf.template
docs/deploy.md            VPS runbook: Docker, env, first owner, TLS, backups, restore
```

---

### Task 1: Shared roles, permissions and request schemas

**Interfaces — Produces (from `@rpos/shared`):**
- `ROLES = ['OWNER','MANAGER','CASHIER','WAITER'] as const`, `type Role`
- `PERMISSIONS` (as const) and `type Permission`:
  `order.take, order.approveQr, bill.print, payment.take, table.manage, discount.apply, discount.unlimited, item.cancelAfterKot, bill.void, day.openClose, day.reopen, menu.manage, menu.availability, settings.manage, stock.manage, expense.manage, reports.all, reports.dayClose, users.manage, devices.manage, audit.view`
- `permissionsFor(role: Role, settings: { waiterCanCollectPayment: boolean }): Permission[]`
- `hasPermission(role, permission, settings): boolean`
- Schemas + inferred types: `phoneSchema`, `pinSchema`, `loginSchema {phone,password}`, `pinLoginSchema {userId,pin}`, `overrideSchema {userId,pin,permission}`, `createUserSchema {name,phone,role,password?,pin?}`, `updateUserSchema` (all optional + nullable `password`/`pin` to clear), `outletSettingsSchema` (partial updates of name, gstin, taxScheme, address, phone, fssaiNumber, billHeader, billFooter, cashierDiscountCapBp 0–10000, waiterCanCollectPayment, parcelPaymentTiming), `registerDeviceSchema {name, type}`; `TAX_SCHEMES`, `DEVICE_TYPES`, `PARCEL_PAYMENT_TIMINGS`.
- `gstinSchema`: 15 chars `^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`.

**Role → permission map (spec §6.1):**

| Permission | OWNER | MANAGER | CASHIER | WAITER |
|---|:-:|:-:|:-:|:-:|
| order.take, order.approveQr, table.manage, menu.availability | ✓ | ✓ | ✓ | ✓ |
| bill.print, payment.take | ✓ | ✓ | ✓ | only if `waiterCanCollectPayment` |
| discount.apply | ✓ | ✓ | ✓ (capped) | |
| discount.unlimited, item.cancelAfterKot, bill.void, day.openClose, menu.manage, stock.manage, reports.dayClose, devices.manage | ✓ | ✓ | | |
| expense.manage | ✓ | ✓ | ✓ | |
| day.reopen, settings.manage, reports.all, users.manage, audit.view | ✓ | | | |

- [ ] **Step 1: Failing tests** — `auth.test.ts`:
  - owner has every permission;
  - manager lacks `day.reopen`, `settings.manage`, `users.manage`, `reports.all`, `audit.view` and has `bill.void`, `devices.manage`;
  - cashier has `discount.apply` but not `discount.unlimited`, `bill.void`;
  - waiter lacks `payment.take` and `bill.print` by default and has both when `waiterCanCollectPayment: true`;
  - `permissionsFor` returns no duplicates.
  `schemas.test.ts`:
  - phone accepts `9876543210`, rejects `1234567890`, `98765`, `+919876543210`;
  - pin accepts `1234`/`123456`, rejects `123`, `1234567`, `12a4`;
  - gstin accepts `29ABCDE1234F1Z5`, rejects lowercase and 14 chars;
  - `createUserSchema` requires password for OWNER/MANAGER and pin for CASHIER/WAITER;
  - `outletSettingsSchema` rejects `cashierDiscountCapBp: 10001` and unknown keys (strict).
- [ ] **Step 2: Run** `pnpm --filter @rpos/shared test` → FAIL (modules missing).
- [ ] **Step 3: Implement** `auth.ts`, `schemas.ts`, export from `index.ts`.
- [ ] **Step 4: Run** → PASS; `typecheck`; `build`.
- [ ] **Step 5: Commit** `feat(shared): add roles, permissions and auth request schemas`.

---

### Task 2: Data model and owner seed

**Interfaces — Produces:** Prisma models `User`, `Device`, `RefreshSession`, `AuditEntry`; enums `Role`, `DeviceType`, `ParcelPaymentTiming`; Outlet columns `address, phone, fssaiNumber, billHeader, billFooter, cashierDiscountCapBp (default 1000), waiterCanCollectPayment (default false), parcelPaymentTiming (default PAY_FIRST)`. `seed(prisma, env)` also creates the owner when `OWNER_PHONE` and `OWNER_PASSWORD` are set and no owner exists. Env adds `JWT_SECRET` (min 32 chars) and `COOKIE_SECURE` (derived: true when NODE_ENV=production).

Models (all snake_case mapped, `created_at`/`updated_at` timestamptz):
- `users`: id, outlet_id → outlets, name, phone (unique), role, password_hash?, pin_hash?, failed_login_count int default 0, locked_until?, archived_at?
- `devices`: id, outlet_id, name, type, token_hash (unique), created_by_id → users, last_seen_at?, revoked_at?
- `refresh_sessions`: id, user_id → users, family_id uuid (indexed), token_hash (unique), expires_at, rotated_at?, revoked_at?, device_id? → devices
- `audit_entries`: id, outlet_id, actor_id? → users, action, entity, entity_id?, reason?, before jsonb?, after jsonb?; index (outlet_id, created_at desc)

- [ ] **Step 1: Failing tests** — `env.spec.ts`: rejects missing `JWT_SECRET`, rejects a 10-char secret, accepts 32+. `seed.e2e-spec.ts`: with owner env, seed twice → exactly one OWNER with argon2 password hash that verifies; without owner env → no users.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** env changes, `.env.example`/`.env.test` (test secret), schema + `prisma migrate dev --name auth_and_settings`, seed.
- [ ] **Step 4: Run** unit + e2e → PASS.
- [ ] **Step 5: Commit** `feat(api): add users, devices, sessions, audit tables and owner seed`.

---

### Task 3: Password login, access guard, refresh rotation, logout, me

**Interfaces — Produces:**
- `POST /api/auth/login` (public) body `loginSchema` → `200 {accessToken, user:{id,name,role}, permissions}` + `Set-Cookie: rpos_rt`. Only OWNER/MANAGER with a password. Errors: `401 {code:'INVALID_CREDENTIALS'}` (same message for unknown phone and wrong password), `423 {code:'LOCKED', retryAfterSeconds}`.
- `POST /api/auth/refresh` (public, cookie) → same body as login, rotates cookie. `401 {code:'SESSION_EXPIRED'}` when missing/expired/revoked/reused/user archived.
- `POST /api/auth/logout` (public, cookie) → `204`, revokes family, clears cookie.
- `GET /api/auth/me` → `{user, permissions, outlet:{id,name}}`.
- Global `AccessGuard` (Bearer JWT; `@Public()` opt-out). `req.user: AuthUser {id, name, role, outletId}`; user re-loaded per request so archived users fail immediately (`401 USER_INACTIVE`).
- `ZodBodyPipe(schema)`; error shape `{code, message, details?}`.
- Health stays public.

- [ ] **Step 1: Failing tests** — unit: `session.service.spec.ts` (rotate returns new token; second rotate of old token → reuse detected → all family revoked), `password.service.spec.ts` (hash ≠ plain, verify true/false). e2e `auth.e2e-spec.ts`:
  - login ok returns token + httpOnly `rpos_rt` cookie with `Path=/api/auth` and `SameSite=Strict`;
  - wrong password and unknown phone both → 401 INVALID_CREDENTIALS;
  - 5 wrong then correct → 423 LOCKED;
  - `/api/auth/me` without token → 401, with token → user;
  - refresh rotates (new cookie value differs) and returns a working access token;
  - **reusing the first refresh cookie after rotation → 401 and the rotated cookie also stops working**;
  - logout → 204, refresh afterwards → 401;
  - cashier with only a PIN cannot use password login → 401;
  - `/api/health` still 200 without auth.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** auth module, guards registered via `APP_GUARD`, `cookie-parser` + `helmet` in `configureApp`, `trust proxy` = 1.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): add password login, JWT access guard and refresh rotation`.

---

### Task 4: Devices, PIN login and manager override

**Interfaces — Produces:**
- `POST /api/devices` (`devices.manage`) body `registerDeviceSchema` → `201 {id,name,type}` + `Set-Cookie: rpos_dt` on the calling browser.
- `GET /api/devices` (`devices.manage`) → list (no hashes). `DELETE /api/devices/:id` (`devices.manage`) → `204`, sets `revoked_at`.
- `GET /api/devices/current` (public, device cookie) → `{id,name,type}` or `401 {code:'DEVICE_NOT_REGISTERED'}`; updates `last_seen_at`.
- `DeviceGuard` + `@CurrentDevice()`.
- `GET /api/auth/staff` (public, device cookie) → active users of the device's outlet that have a PIN: `[{id,name,role}]`.
- `POST /api/auth/pin-login` (public, device cookie) body `pinLoginSchema` → like login, 12 h session tied to the device. Same lockout rules; revoked device → 401.
- `POST /api/auth/override` (authenticated) body `overrideSchema` → `{overrideToken, expiresInSeconds: 60}` when that user's PIN is right and their role has the permission; else `403 {code:'OVERRIDE_DENIED'}`. Audit entry `auth.override` with actor = approving user, `after: {permission, requestedBy}`.
- `PermissionsGuard`: if `req.user` lacks a required permission and header `x-override-token` carries a valid override JWT for that permission and outlet → allowed, `req.actor` = approving user. Otherwise `403 {code:'FORBIDDEN', permission}`.

- [ ] **Step 1: Failing tests** — e2e `devices.e2e-spec.ts`:
  - manager registers device → cookie `rpos_dt` set with `Path=/api`;
  - `/api/devices/current` with that cookie → device; without → 401;
  - `/api/auth/staff` lists only users with PIN, excludes archived;
  - pin-login with right PIN → token; wrong PIN ×5 then right → 423;
  - pin-login without device cookie → 401; after device revoked → 401;
  - override: cashier token + manager override token on a route requiring `bill.void` (test-only controller mounted in test module) → 200; cashier alone → 403; override for a different permission → 403; expired override (sign with -1s) → 403;
  - override request with a cashier's own PIN for `bill.void` → 403 OVERRIDE_DENIED.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** devices module, DeviceGuard, pin-login, staff list, override issue + guard logic.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): add device registration, PIN login and manager override`.

---

### Task 5: Users, outlet settings, audit API; throttling

**Interfaces — Produces:**
- `GET /api/users` (`users.manage`) → `[{id,name,phone,role,hasPassword,hasPin,archivedAt,lockedUntil}]` — never hashes.
- `POST /api/users` (`users.manage`) body `createUserSchema` → 201 user; duplicate phone → `409 {code:'PHONE_TAKEN'}`.
- `PATCH /api/users/:id` (`users.manage`) body `updateUserSchema`; setting `password: null`/`pin: null` clears it; changing a role or credentials revokes that user's refresh sessions; unlocks on credential reset.
- `POST /api/users/:id/archive` (`users.manage`) → archives + revokes sessions; `POST /api/users/:id/restore`.
- Guard rails: cannot archive yourself; cannot demote or archive the last active OWNER → `409 {code:'LAST_OWNER'}`.
- `GET /api/outlet` (any authenticated user, or device cookie) → settings. `PATCH /api/outlet` (`settings.manage`) body `outletSettingsSchema` → updated settings; audit `outlet.update` with before/after of changed fields.
- `GET /api/audit?limit=50&before=<iso>` (`audit.view`) → newest first.
- Audit also written for: user create/update/archive/restore (`user.*`), device register/revoke (`device.*`).
- Throttling: global 300 req/min/IP; `login`, `pin-login`, `override` limited to 10/min/IP (`429`).

- [ ] **Step 1: Failing tests** — e2e `users.e2e-spec.ts`, `outlet.e2e-spec.ts`:
  - owner creates cashier with PIN → response has `hasPin: true` and no `pinHash`/`passwordHash` anywhere in body;
  - duplicate phone → 409;
  - manager calling `GET /api/users` → 403;
  - archiving a user → their existing access token now 401 USER_INACTIVE and refresh 401;
  - archiving self → 409; demoting the only owner → 409 LAST_OWNER;
  - outlet PATCH by owner updates `cashierDiscountCapBp` and writes an audit entry visible in `/api/audit`; manager PATCH → 403; invalid GSTIN → 400 VALIDATION;
  - 11th login request within a minute → 429 (uses a fresh app instance).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** users, outlet, audit modules; ThrottlerModule.
- [ ] **Step 4: Run** full api unit + e2e → PASS.
- [ ] **Step 5: Commit** `feat(api): add staff management, outlet settings, audit log and throttling`.

---

### Task 6: Web session plumbing, login and PIN screens, route guards

**Interfaces — Produces:**
- `useSession` Zustand store: `{status:'loading'|'anonymous'|'authenticated', accessToken, user, permissions, setSession, clear}`.
- `apiFetch<T>(path, init?)`: JSON in/out, `credentials:'include'`, Bearer token; on 401 performs **one shared** `POST /api/auth/refresh` and retries once; refresh failure → `clear()` and throws `ApiError{status, code, message}`.
- `useBootSession()`: on mount calls refresh; sets `anonymous` on failure.
- `<RequireAuth permission?>`: loading → spinner text "Loading…"; anonymous → redirect `/pin` if device registered else `/login`; lacking permission → "You do not have access to this screen."
- `/login` page: phone + password, errors "Wrong phone number or password." / "Too many attempts. Try again in N minutes."
- `/pin` page: staff buttons from `/api/auth/staff`, 4–6 digit keypad, submits pin-login; if device not registered shows "This device is not registered. Ask a manager to sign in and register it." with link to `/login`.
- Header shows user name + "Sign out" (calls logout, clears store).
- Area guards: `/pos` needs `bill.print`; `/captain` needs `order.take`; `/admin/*` needs any of `users.manage, settings.manage, devices.manage, menu.manage`; `/kds` stays public placeholder (device-auth arrives in M2).

- [ ] **Step 1: Failing tests** — `api.test.ts`: attaches bearer; 401 → refresh → retry succeeds; **three concurrent 401s trigger exactly one refresh call**; refresh failure clears session and throws ApiError. `LoginPage.test.tsx`: success navigates to `/`; 401 shows message; 423 shows minutes. `PinPage.test.tsx`: lists staff, entering PIN submits pin-login; unregistered device message. `routes.test.tsx`: `/pos` anonymous → login page; authenticated waiter → no-access message.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** web tests → PASS; build.
- [ ] **Step 5: Commit** `feat(web): add session handling, login, PIN pad and route guards`.

---

### Task 7: Admin screens — staff, settings, devices, audit

**Interfaces — Consumes:** Task 5 endpoints. **Produces:** `/admin` layout with tabs Staff · Settings · Devices · Audit (tabs hidden when the permission is missing).

- Staff: table (name, phone, role, PIN/password badges, status), "Add staff" form (role select; password field for owner/manager, PIN field for cashier/waiter), edit, archive/restore with confirm step built into the page.
- Settings: form for all outlet settings with validation from `outletSettingsSchema`; discount cap entered as percent (e.g. 10) and stored as basis points.
- Devices: list, "Register this device" form (name + type), revoke with confirm.
- Audit: newest-first list (time, actor, action, entity, reason), "Load more".

- [ ] **Step 1: Failing tests** — `StaffPage.test.tsx` (renders users; add cashier posts `{role:'CASHIER', pin}`; password field shown only for owner/manager), `SettingsPage.test.tsx` (10% → `cashierDiscountCapBp: 1000`; invalid GSTIN shows error, no request), `DevicesPage.test.tsx` (register posts name/type; revoke asks to confirm then DELETEs).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement. Step 4: Run** → PASS; build.
- [ ] **Step 5: Commit** `feat(web): add admin screens for staff, settings, devices and audit`.

---

### Task 8: Backups, TLS overlay, deploy runbook

**Produces:**
- `backup` service in `docker-compose.prod.yml`: image built from `docker/backup/Dockerfile` (postgres:16-alpine + gnupg), runs `backup.sh` daily at `BACKUP_HOUR` (default 02 local, `TZ=Asia/Kolkata`): `pg_dump -Fc` → `/backups/rpos-YYYYmmdd-HHMM.dump[.gpg]` (gpg symmetric AES256 when `BACKUP_PASSPHRASE` set), deletes files older than `BACKUP_RETENTION_DAYS` (30). `backup.sh --once` for manual runs.
- `docker-compose.prod.yml`: api gets `JWT_SECRET` (required), `OWNER_NAME/OWNER_PHONE/OWNER_PASSWORD` passthrough for seeding.
- `docker-compose.tls.yml` overlay: web listens 80 + 443 with `docker/nginx/tls.conf.template` (envsubst `DOMAIN`), HTTP → HTTPS redirect except `/.well-known/acme-challenge/`, certbot service with webroot renewals every 12 h.
- `docs/deploy.md`: VPS prerequisites, clone, `.env.prod`, `up`, seed first owner, DNS + certificate issue command, switching on TLS overlay, backups: where, offsite copy (`rclone copy`), restore drill (`pg_restore` into a scratch DB), updating to a new version.

- [ ] **Step 1: Verification target (no unit tests for shell)** — `sh -n docker/backup/backup.sh`; build backup image; run `backup.sh --once` against the prod stack; a `.dump` file appears and `pg_restore --list` reads it; with `BACKUP_PASSPHRASE` set the file ends `.gpg` and decrypts.
- [ ] **Step 2: Implement** files.
- [ ] **Step 3: Run the verification** on the local prod stack, plus `docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml config --quiet` with `DOMAIN=pos.example.com`.
- [ ] **Step 4: Commit** `build: add nightly encrypted backups, TLS overlay and deploy runbook`.
