import type { INestApplication, Type } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import type { Outlet, PrismaClient, Role, User } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { randomToken, sha256 } from '../src/common/crypto';
import { PrismaService } from '../src/prisma/prisma.service';

/** Empties every table, children first. Keep in sync with prisma/schema.prisma. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE qr_submissions, qr_sessions, payments, bill_items, bills, idempotency_keys, ' +
      'print_jobs, kot_lines, ' +
      'order_items, kots, orders, ' +
      'counters, business_days, combo_components, item_addon_groups, addons, addon_groups, item_variants, ' +
      'items, categories, printers, stations, tax_rates, tables, areas, used_override_tokens, ' +
      'password_attempts, audit_entries, refresh_sessions, devices, users, outlets ' +
      'RESTART IDENTITY CASCADE',
  );
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(
  options: {
    controllers?: Type[];
    customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  } = {},
): Promise<TestContext> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });
  if (options.customize) builder = options.customize(builder);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

export async function createOutlet(prisma: PrismaClient): Promise<Outlet> {
  return prisma.outlet.create({ data: { name: 'Test Outlet' } });
}

let phoneCounter = 0;
export function nextPhone(): string {
  phoneCounter += 1;
  return `9${String(100000000 + phoneCounter).slice(-9)}`;
}

export async function createUser(
  prisma: PrismaClient,
  outletId: string,
  options: { role: Role; password?: string; pin?: string; name?: string; phone?: string },
): Promise<User> {
  return prisma.user.create({
    data: {
      outletId,
      name: options.name ?? `${options.role.toLowerCase()} user`,
      phone: options.phone ?? nextPhone(),
      role: options.role,
      passwordHash: options.password ? await hash(options.password) : null,
      pinHash: options.pin ? await hash(options.pin) : null,
    },
  });
}

/** Returns the value of a cookie from a supertest response, or undefined. */
export function readCookie(
  res: { headers: Record<string, unknown> },
  name: string,
): string | undefined {
  const header = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const match = cookies.find((c) => c.startsWith(`${name}=`));
  return match?.split(';')[0]?.slice(name.length + 1);
}

export function rawSetCookie(res: { headers: Record<string, unknown> }, name: string): string {
  const header = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  return cookies.find((c) => c.startsWith(`${name}=`)) ?? '';
}

export async function loginWithPassword(
  ctx: TestContext,
  phone: string,
  password: string,
): Promise<{ accessToken: string; refreshCookie: string }> {
  const res = await ctx.http().post('/api/auth/login').send({ phone, password }).expect(200);
  return { accessToken: res.body.accessToken, refreshCookie: readCookie(res, 'rpos_rt') ?? '' };
}

/** Registers a device directly and returns its cookie value. */
export async function createDevice(
  prisma: PrismaClient,
  outletId: string,
  createdById: string,
  type: 'POS' | 'CAPTAIN' | 'KDS' | 'PRINT_AGENT' = 'POS',
  name = `${type} device`,
): Promise<{ id: string; cookie: string }> {
  const cookie = randomToken();
  const device = await prisma.device.create({
    data: { outletId, name, type, tokenHash: sha256(cookie), createdById },
  });
  return { id: device.id, cookie };
}

export interface SignedIn {
  user: User;
  token: string;
  /** Headers a browser would send: bearer token, plus the device cookie for PIN staff. */
  auth: Record<string, string>;
  deviceCookie?: string;
}

/** Creates a user of the given role and signs them in (password or PIN on a device). */
export async function signIn(
  ctx: TestContext,
  outletId: string,
  role: Role,
  name?: string,
): Promise<SignedIn> {
  if (role === 'OWNER' || role === 'MANAGER') {
    const user = await createUser(ctx.prisma, outletId, {
      role,
      password: 'test-pass-1',
      pin: '9999',
      name,
    });
    const { accessToken } = await loginWithPassword(ctx, user.phone, 'test-pass-1');
    return { user, token: accessToken, auth: { Authorization: `Bearer ${accessToken}` } };
  }
  const user = await createUser(ctx.prisma, outletId, { role, pin: '1234', name });
  const owner = await ctx.prisma.user.findFirst({ where: { outletId } });
  const device = await createDevice(
    ctx.prisma,
    outletId,
    owner!.id,
    role === 'WAITER' ? 'CAPTAIN' : 'POS',
  );
  const res = await ctx
    .http()
    .post('/api/auth/pin-login')
    .set('Cookie', `rpos_dt=${device.cookie}`)
    .send({ userId: user.id, pin: '1234' })
    .expect(200);
  const token = res.body.accessToken as string;
  return {
    user,
    token,
    deviceCookie: device.cookie,
    auth: { Authorization: `Bearer ${token}`, Cookie: `rpos_dt=${device.cookie}` },
  };
}
