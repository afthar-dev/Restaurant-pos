import type { AddressInfo } from 'node:net';
import type { Outlet } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createDevice,
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

/**
 * Browsers only send the httpOnly device cookie (Path=/api) to URLs under /api, so the socket
 * must live there for kitchen screens and printing devices to authenticate.
 */
const SOCKET_PATH = '/api/socket.io';

function nextEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no ${event} within ${timeoutMs}ms`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

describe('realtime', () => {
  let ctx: TestContext;
  let url: string;
  let outlet: Outlet;
  let r: Restaurant;
  let owner: SignedIn;
  let waiter: SignedIn;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen(0, '127.0.0.1');
    const address = ctx.app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    outlet = await createOutlet(ctx.prisma);
    r = await buildRestaurant(ctx.prisma, outlet.id);
    owner = await signIn(ctx, outlet.id, 'OWNER');
    waiter = await signIn(ctx, outlet.id, 'WAITER');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 0 })
      .expect(201);
  });

  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  function userSocket(token: string): Socket {
    const s = io(url, {
      path: SOCKET_PATH,
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(s);
    return s;
  }

  function userDeviceSocket(token: string, cookie: string): Socket {
    const s = io(url, {
      path: SOCKET_PATH,
      auth: { token },
      transports: ['websocket'],
      extraHeaders: { Cookie: `rpos_dt=${cookie}` },
      forceNew: true,
    });
    sockets.push(s);
    return s;
  }

  function deviceSocket(cookie: string): Socket {
    const s = io(url, {
      path: SOCKET_PATH,
      transports: ['websocket'],
      extraHeaders: { Cookie: `rpos_dt=${cookie}` },
      forceNew: true,
    });
    sockets.push(s);
    return s;
  }

  async function sendKot() {
    const order = (
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t1.id, guests: 2 })
    ).body;
    await ctx
      .http()
      .post(`/api/orders/${order.id}/items`)
      .set(waiter.auth)
      .send({ items: [{ variantId: r.paneer.half.id, quantity: 1, addonIds: [] }] });
    await ctx.http().post(`/api/orders/${order.id}/kot`).set(waiter.auth).expect(201);
    return order.id as string;
  }

  it('tells signed-in screens about new KOTs and order changes', async () => {
    const socket = userSocket(owner.token);
    await connected(socket);
    const kotCreated = nextEvent<{ orderId: string; stationId: string }>(socket, 'kot.created');
    const orderId = await sendKot();
    expect(await kotCreated).toMatchObject({ orderId, stationId: r.kitchen.id });
  });

  it('alerts staff screens when a customer orders from a table QR', async () => {
    const socket = userSocket(waiter.token);
    await connected(socket);
    const alert = nextEvent<{ tableName: string; orderId: string }>(socket, 'qr.submitted');
    const session = await ctx
      .http()
      .post('/api/qr/sessions')
      .send({ code: r.t1.qrToken })
      .expect(201);
    await ctx
      .http()
      .post('/api/qr/orders')
      .set('x-qr-session', session.body.token)
      .send({ lines: [{ variantId: r.roti.regular.id, quantity: 1, addonIds: [] }] })
      .expect(201);
    expect(await alert).toMatchObject({ tableName: 'T1', orderId: expect.any(String) });
  });

  it('sends print jobs only to the device that prints them', async () => {
    const counter = await createDevice(ctx.prisma, outlet.id, owner.user.id, 'POS', 'Counter');
    const other = await createDevice(ctx.prisma, outlet.id, owner.user.id, 'POS', 'Other');
    await ctx.prisma.printer.create({
      data: {
        outletId: outlet.id,
        name: 'Kitchen printer',
        purpose: 'KOT',
        stationId: r.kitchen.id,
        deviceId: counter.id,
      },
    });
    const mine = deviceSocket(counter.cookie);
    const theirs = deviceSocket(other.cookie);
    await Promise.all([connected(mine), connected(theirs)]);

    let leaked = false;
    theirs.on('print.job', () => {
      leaked = true;
    });
    const job = nextEvent<{ jobId: string }>(mine, 'print.job');
    await sendKot();
    expect((await job).jobId).toEqual(expect.any(String));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(leaked).toBe(false);
  });

  it('serves the socket under the device cookie path', async () => {
    const res = await ctx
      .http()
      .post('/api/devices')
      .set(owner.auth)
      .send({ name: 'Kitchen screen', type: 'KDS' })
      .expect(201);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('rpos_dt='),
    )!;
    const cookiePath = /Path=([^;]+)/.exec(cookie)![1]!;
    expect(SOCKET_PATH.startsWith(cookiePath)).toBe(true);
  });

  it('delivers print jobs to a signed-in counter that also prints', async () => {
    const counter = await createDevice(ctx.prisma, outlet.id, owner.user.id, 'POS', 'Counter');
    await ctx.prisma.printer.create({
      data: {
        outletId: outlet.id,
        name: 'Kitchen printer',
        purpose: 'KOT',
        stationId: r.kitchen.id,
        deviceId: counter.id,
      },
    });
    const socket = userDeviceSocket(owner.token, counter.cookie);
    await connected(socket);
    const job = nextEvent<{ jobId: string }>(socket, 'print.job');
    await sendKot();
    expect((await job).jobId).toEqual(expect.any(String));
  });

  it('does not leak events to another outlet', async () => {
    const elsewhere = await ctx.prisma.outlet.create({ data: { name: 'Elsewhere' } });
    const stranger = await signIn(ctx, elsewhere.id, 'OWNER');
    const socket = userSocket(stranger.token);
    await connected(socket);
    let leaked = false;
    socket.on('kot.created', () => {
      leaked = true;
    });
    await sendKot();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toBe(false);
  });

  it('announces stock changes', async () => {
    const socket = userSocket(owner.token);
    await connected(socket);
    const change = nextEvent<{ itemId: string; isAvailable: boolean }>(socket, 'menu.availability');
    await ctx
      .http()
      .patch(`/api/menu/items/${r.paneer.item.id}/availability`)
      .set(waiter.auth)
      .send({ isAvailable: false })
      .expect(200);
    expect(await change).toEqual({ itemId: r.paneer.item.id, isAvailable: false });
  });

  it('disconnects a socket with a bad token', async () => {
    const socket = userSocket('not-a-token');
    const reason = await Promise.race([
      nextEvent<string>(socket, 'disconnect'),
      nextEvent<Error>(socket, 'connect_error').then(() => 'connect_error'),
    ]);
    expect(reason).toBeTruthy();
    expect(socket.connected).toBe(false);
  });
});
