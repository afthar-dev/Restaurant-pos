import type { Restaurant } from './fixtures';
import type { SignedIn, TestContext } from './helpers';

export interface Line {
  variantId: string;
  quantity: number;
  addonIds?: string[];
}

/** A dine-in order on `tableId` with `lines` sent to the kitchen. Returns the order id. */
export async function servedOrder(
  ctx: TestContext,
  r: Restaurant,
  staff: SignedIn,
  lines: Line[],
  tableId = r.t1.id,
): Promise<string> {
  const order = await ctx
    .http()
    .post('/api/orders')
    .set(staff.auth)
    .send({ type: 'DINE_IN', tableId, guests: 2 })
    .expect(201);
  await addAndSend(ctx, staff, order.body.id, lines);
  return order.body.id;
}

/** A parcel order with `lines` sent to the kitchen. Returns the order id. */
export async function parcelOrder(
  ctx: TestContext,
  staff: SignedIn,
  lines: Line[],
): Promise<string> {
  const order = await ctx
    .http()
    .post('/api/orders')
    .set(staff.auth)
    .send({ type: 'PARCEL' })
    .expect(201);
  await addAndSend(ctx, staff, order.body.id, lines);
  return order.body.id;
}

async function addAndSend(ctx: TestContext, staff: SignedIn, orderId: string, lines: Line[]) {
  await ctx
    .http()
    .post(`/api/orders/${orderId}/items`)
    .set(staff.auth)
    .send({ items: lines.map((l) => ({ addonIds: [], ...l })) })
    .expect(201);
  await ctx.http().post(`/api/orders/${orderId}/kot`).set(staff.auth).expect(201);
}

/** A manager's one-time approval for `requester` (managers sign in with PIN 9999 in tests). */
export async function overrideToken(
  ctx: TestContext,
  approver: SignedIn,
  requester: SignedIn,
  permission: string,
): Promise<string> {
  const res = await ctx
    .http()
    .post('/api/auth/override')
    .set(requester.auth)
    .send({ userId: approver.user.id, pin: '9999', permission })
    .expect(201);
  return res.body.overrideToken;
}
