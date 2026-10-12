import type { Outlet } from '@prisma/client';
import {
  billFor as billForOn,
  overrideToken,
  parcelOrder,
  pay as payOn,
  servedOrder,
} from './billing-helpers';
import { buildRestaurant, type Restaurant } from './fixtures';
import {
  createOutlet,
  createTestApp,
  resetDatabase,
  signIn,
  type SignedIn,
  type TestContext,
} from './helpers';

describe('bills', () => {
  let ctx: TestContext;
  let outlet: Outlet;
  let r: Restaurant;
  let owner: SignedIn;
  let manager: SignedIn;
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
    manager = await signIn(ctx, outlet.id, 'MANAGER', 'Meena');
    cashier = await signIn(ctx, outlet.id, 'CASHIER', 'Kavya');
    waiter = await signIn(ctx, outlet.id, 'WAITER', 'Arun');
    await ctx
      .http()
      .post('/api/business-day/open')
      .set(owner.auth)
      .send({ openingCash: 100000 })
      .expect(201);
  });

  const createBill = (orderId: string, body: object = {}, who = cashier) =>
    ctx.http().post(`/api/orders/${orderId}/bills`).set(who.auth).send(body);

  const getOrder = async (orderId: string) =>
    (await ctx.http().get(`/api/orders/${orderId}`).set(cashier.auth).expect(200)).body;

  describe('creating', () => {
    it('charges a no-GST dish at its price and keeps it out of the tax footer', async () => {
      const chai = await ctx
        .http()
        .post('/api/menu/items')
        .set(owner.auth)
        .send({
          categoryId: r.starters.id,
          name: 'Masala Chai',
          foodType: 'VEG',
          taxRateId: null,
          variants: [{ name: 'Regular', dineInPrice: 3000 }],
          addonGroupIds: [],
          isCombo: false,
          components: [],
        })
        .expect(201);
      expect(chai.body.taxRate).toBeNull();
      const chaiId = chai.body.variants[0].id as string;
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: chaiId, quantity: 2 },
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      expect((await getOrder(orderId)).items[0]).toMatchObject({ cgstBp: 0, sgstBp: 0 });
      const res = await createBill(orderId).expect(201);
      // Chai ₹60 with no GST; roti ₹30 + 5% → ₹31.50; ₹91.50 rounds to ₹92.
      expect(res.body.total).toBe(9200);
      // The No-GST chai is not taxable value.
      expect(res.body).toMatchObject({ taxable: 3000, exempt: 6000 });
      expect(res.body.taxBreakup).toEqual([
        expect.objectContaining({ cgstBp: 250, sgstBp: 250, taxable: 3000 }),
      ]);
    });

    it('bills the whole order with 5% GST, numbers it and marks the order billed', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.paneer.half.id, quantity: 2, addonIds: [r.extras.cheese.id] },
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const res = await createBill(orderId).expect(201);
      // (₹180 + ₹30) × 2 + ₹30 = ₹450; tax ₹11.25 + ₹11.25 → ₹472.50 → ₹473
      expect(res.body).toMatchObject({
        billNo: 1,
        status: 'OPEN',
        title: 'Tax Invoice',
        orderType: 'DINE_IN',
        tableName: 'T1',
        subtotal: 45000,
        cgst: 1125,
        sgst: 1125,
        roundOff: 50,
        total: 47300,
        paid: 0,
        due: 47300,
      });
      expect(res.body.financialYear).toMatch(/^\d{4}-\d{2}$/);
      expect(res.body.lines[0]).toMatchObject({
        itemName: 'Paneer Tikka',
        variantName: 'Half',
        addons: [{ name: 'Cheese', price: 3000 }],
        unitPrice: 21000,
        quantity: 2,
        lineTotal: 42000,
      });
      expect(res.body.taxBreakup).toEqual([
        { cgstBp: 250, sgstBp: 250, taxable: 45000, cgst: 1125, sgst: 1125 },
      ]);
      const order = await getOrder(orderId);
      expect(order.status).toBe('BILLED');
      expect(order.bills).toEqual([
        { id: res.body.id, billNo: 1, status: 'OPEN', total: 47300, paid: 0 },
      ]);
      expect(order.items.map((i: { billedQuantity: number }) => i.billedQuantity)).toEqual([2, 1]);
    });

    it('numbers bills one after another across orders', async () => {
      const first = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const second = await servedOrder(
        ctx,
        r,
        waiter,
        [{ variantId: r.roti.regular.id, quantity: 1 }],
        r.t2.id,
      );
      expect((await createBill(first).expect(201)).body.billNo).toBe(1);
      expect((await createBill(second).expect(201)).body.billNo).toBe(2);
    });

    it('splits by items into separate bills and only marks the order billed at the end', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.paneer.half.id, quantity: 2 },
        { variantId: r.roti.regular.id, quantity: 3 },
      ]);
      const order = await getOrder(orderId);
      const paneer = order.items.find((i: { itemName: string }) => i.itemName === 'Paneer Tikka');
      const first = await createBill(orderId, {
        lines: [{ orderItemId: paneer.id, quantity: 1 }],
      }).expect(201);
      expect(first.body.subtotal).toBe(18000);
      let current = await getOrder(orderId);
      expect(current.status).toBe('OPEN');
      expect(current.items.find((i: { id: string }) => i.id === paneer.id).billedQuantity).toBe(1);

      const tooMany = await createBill(orderId, {
        lines: [{ orderItemId: paneer.id, quantity: 2 }],
      }).expect(409);
      expect(tooMany.body.code).toBe('ALREADY_BILLED');

      const rest = await createBill(orderId).expect(201);
      expect(rest.body.subtotal).toBe(18000 + 9000);
      current = await getOrder(orderId);
      expect(current.status).toBe('BILLED');
      const none = await createBill(orderId).expect(409);
      expect(none.body.code).toBe('NOTHING_TO_BILL');
    });

    it('refuses a dish from another order or the same dish twice', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 2 },
      ]);
      const other = await servedOrder(
        ctx,
        r,
        waiter,
        [{ variantId: r.roti.regular.id, quantity: 1 }],
        r.t2.id,
      );
      const foreign = (await getOrder(other)).items[0].id;
      const res = await createBill(orderId, {
        lines: [{ orderItemId: foreign, quantity: 1 }],
      }).expect(400);
      expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'orderItemId' });
      const own = (await getOrder(orderId)).items[0].id;
      await createBill(orderId, {
        lines: [
          { orderItemId: own, quantity: 1 },
          { orderItemId: own, quantity: 1 },
        ],
      }).expect(400);
    });

    it('refuses to bill dishes that were not sent to the kitchen', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      await ctx
        .http()
        .post(`/api/orders/${orderId}/items`)
        .set(waiter.auth)
        .send({ items: [{ variantId: r.roti.regular.id, quantity: 1, addonIds: [] }] })
        .expect(201);
      const res = await createBill(orderId).expect(409);
      expect(res.body.code).toBe('UNSENT_ITEMS');
    });

    it('adds parcel packaging and the bill packaging setting once per order', async () => {
      await ctx.prisma.outlet.update({
        where: { id: outlet.id },
        data: { billPackagingCharge: 1000 },
      });
      const orderId = await parcelOrder(ctx, cashier, [
        { variantId: r.paneer.full.id, quantity: 2 },
      ]);
      const res = await createBill(orderId).expect(201);
      // 2 × ₹330 + 2 × ₹10 + ₹10 = ₹690 taxable; 5% → ₹724.50 → ₹725
      expect(res.body).toMatchObject({
        orderType: 'PARCEL',
        tableName: null,
        subtotal: 66000,
        packaging: 3000,
        taxable: 69000,
        total: 72500,
      });
    });

    it('prints a bill of supply without tax under the composition scheme', async () => {
      await ctx.prisma.outlet.update({
        where: { id: outlet.id },
        data: { taxScheme: 'COMPOSITION' },
      });
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const res = await createBill(orderId).expect(201);
      expect(res.body).toMatchObject({
        title: 'Bill of Supply',
        cgst: 0,
        sgst: 0,
        total: 3000,
        taxBreakup: [],
      });
    });

    it('does not let a waiter print a bill unless the outlet allows it', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      await createBill(orderId, {}, waiter).expect(403);
    });
  });

  describe('reading', () => {
    it('lists the bills of an order and shows one bill', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const bill = (await createBill(orderId).expect(201)).body;
      const list = await ctx
        .http()
        .get(`/api/orders/${orderId}/bills`)
        .set(cashier.auth)
        .expect(200);
      expect(list.body.map((b: { id: string }) => b.id)).toEqual([bill.id]);
      const one = await ctx.http().get(`/api/bills/${bill.id}`).set(manager.auth).expect(200);
      expect(one.body).toMatchObject({ id: bill.id, createdBy: { name: 'Kavya' } });
    });

    it('does not show another outlet its bills', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      const bill = (await createBill(orderId).expect(201)).body;
      const elsewhere = await createOutlet(ctx.prisma);
      const stranger = await signIn(ctx, elsewhere.id, 'OWNER');
      await ctx.http().get(`/api/bills/${bill.id}`).set(stranger.auth).expect(404);
    });
  });

  describe('discounts', () => {
    /** 2 × Paneer Half (₹360) + 1 × Roti (₹30): subtotal ₹390, so the 10% cashier cap is ₹39. */
    async function bill390() {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.paneer.half.id, quantity: 2 },
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      return (await createBill(orderId).expect(201)).body;
    }

    const discount = (billId: string, body: object, who = cashier) =>
      ctx.http().put(`/api/bills/${billId}/discount`).set(who.auth).send(body);

    it('lets a cashier give up to the cap with a reason, and audits it', async () => {
      const bill = await bill390();
      const res = await discount(bill.id, {
        bill: { kind: 'PERCENT', value: 1000 },
        reason: 'Regular guest',
      }).expect(200);
      expect(res.body).toMatchObject({
        billDiscount: 3900,
        discountReason: 'Regular guest',
        discount: { kind: 'PERCENT', value: 1000 },
        taxable: 35100,
      });
      expect(res.body.version).toBeGreaterThan(bill.version);
      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'bill.discount' },
      });
      expect(audit).toMatchObject({
        entityId: bill.id,
        reason: 'Regular guest',
        actorId: cashier.user.id,
      });
    });

    it('asks a manager above the cashier cap', async () => {
      const bill = await bill390();
      const res = await discount(bill.id, {
        bill: { kind: 'PERCENT', value: 2000 },
        reason: 'Complaint',
      }).expect(403);
      expect(res.body).toMatchObject({ code: 'DISCOUNT_OVER_LIMIT', capBp: 1000, allowed: 3900 });
      expect(
        (await ctx.http().get(`/api/bills/${bill.id}`).set(cashier.auth)).body.billDiscount,
      ).toBe(0);

      const token = await overrideToken(ctx, manager, cashier, 'discount.unlimited');
      const ok = await ctx
        .http()
        .put(`/api/bills/${bill.id}/discount`)
        .set({ ...cashier.auth, 'x-override-token': token })
        .send({ bill: { kind: 'PERCENT', value: 2000 }, reason: 'Complaint' })
        .expect(200);
      expect(ok.body.billDiscount).toBe(7800);
      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'bill.discount' },
      });
      expect(audit.actorId).toBe(manager.user.id);
    });

    it('lets a manager give any discount, but never below zero', async () => {
      const bill = await bill390();
      const res = await discount(
        bill.id,
        { bill: { kind: 'FLAT', value: 100000 }, reason: 'On the house' },
        manager,
      ).expect(200);
      expect(res.body).toMatchObject({ billDiscount: 39000, taxable: 0, total: 0 });
    });

    it('discounts a single dish and can remove it again', async () => {
      const bill = await bill390();
      const roti = bill.lines.find((l: { itemName: string }) => l.itemName === 'Tandoori Roti');
      const res = await discount(bill.id, {
        items: [{ billItemId: roti.id, discount: { kind: 'FLAT', value: 1000 } }],
        reason: 'Burnt',
      }).expect(200);
      expect(res.body).toMatchObject({ itemDiscount: 1000, subtotal: 38000 });
      expect(res.body.lines[1].discount).toEqual({ kind: 'FLAT', value: 1000 });
      const cleared = await discount(bill.id, {
        items: [{ billItemId: roti.id, discount: null }],
      }).expect(200);
      expect(cleared.body).toMatchObject({ itemDiscount: 0, subtotal: 39000 });
    });

    it('needs a reason, a line of this bill and the current version', async () => {
      const bill = await bill390();
      await discount(bill.id, { bill: { kind: 'FLAT', value: 1000 } }).expect(400);
      const other = await servedOrder(
        ctx,
        r,
        waiter,
        [{ variantId: r.roti.regular.id, quantity: 1 }],
        r.t2.id,
      );
      const otherBill = (await createBill(other).expect(201)).body;
      const res = await discount(bill.id, {
        items: [{ billItemId: otherBill.lines[0].id, discount: { kind: 'FLAT', value: 100 } }],
        reason: 'Mixed up',
      }).expect(400);
      expect(res.body).toMatchObject({ code: 'INVALID_REFERENCE', field: 'billItemId' });
      const stale = await ctx
        .http()
        .put(`/api/bills/${bill.id}/discount`)
        .set({ ...cashier.auth, 'If-Match': String(bill.version + 5) })
        .send({ bill: null })
        .expect(409);
      expect(stale.body.code).toBe('BILL_CHANGED');
    });

    it('does not let a waiter discount', async () => {
      const bill = await bill390();
      await discount(
        bill.id,
        { bill: { kind: 'FLAT', value: 100 }, reason: 'Friend' },
        waiter,
      ).expect(403);
    });
  });

  describe('void', () => {
    const roti = () => [{ variantId: r.roti.regular.id, quantity: 1 }];
    const billFor = (lines = roti(), tableId = r.t1.id) =>
      billForOn(ctx, r, waiter, cashier, lines, tableId);
    const voidBill = (billId: string, who: SignedIn, extra: Record<string, string> = {}) =>
      ctx
        .http()
        .post(`/api/bills/${billId}/void`)
        .set({ ...who.auth, ...extra })
        .send({ reason: 'Wrong table' });

    it('voids an unpaid bill with a manager, keeps its number and reopens the order', async () => {
      const bill = await billFor();
      await voidBill(bill.id, cashier).expect(403);
      const res = await voidBill(bill.id, manager).expect(201);
      expect(res.body).toMatchObject({
        status: 'VOID',
        billNo: bill.billNo,
        voidReason: 'Wrong table',
        due: 0,
      });
      const order = await getOrder(bill.orderId);
      expect(order.status).toBe('OPEN');
      expect(order.items[0].billedQuantity).toBe(0);
      const again = await createBill(bill.orderId).expect(201);
      expect(again.body.billNo).toBe(bill.billNo + 1);
      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'bill.void', entityId: bill.id },
      });
      expect(audit).toMatchObject({ actorId: manager.user.id, reason: 'Wrong table' });
    });

    it('lets a cashier void with a manager PIN override', async () => {
      const bill = await billFor();
      const token = await overrideToken(ctx, manager, cashier, 'bill.void');
      await voidBill(bill.id, cashier, { 'x-override-token': token }).expect(201);
      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'bill.void' },
      });
      expect(audit.actorId).toBe(manager.user.id);
      expect(audit.after).toMatchObject({ requestedBy: cashier.user.id });
    });

    it('reopens a paid order, but not onto a table that has new guests', async () => {
      const paidBill = await billFor();
      await payOn(ctx, cashier, paidBill.id, { mode: 'CASH', amount: paidBill.total }).expect(201);
      await voidBill(paidBill.id, manager).expect(201);
      expect((await getOrder(paidBill.orderId)).status).toBe('OPEN');

      const other = await billFor(roti(), r.t2.id);
      await payOn(ctx, cashier, other.id, { mode: 'CASH', amount: other.total }).expect(201);
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t2.id, guests: 2 })
        .expect(201);
      const res = await voidBill(other.id, manager).expect(409);
      expect(res.body.code).toBe('TABLE_BUSY');
      expect((await ctx.http().get(`/api/bills/${other.id}`).set(cashier.auth)).body.status).toBe(
        'PAID',
      );
    });

    it('refuses to void twice', async () => {
      const bill = await billFor();
      await voidBill(bill.id, manager).expect(201);
      const res = await voidBill(bill.id, manager).expect(409);
      expect(res.body.code).toBe('BILL_ALREADY_VOID');
    });

    it('blocks voiding the whole order while a bill is live', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 2 },
      ]);
      const item = (await getOrder(orderId)).items[0];
      await createBill(orderId, { lines: [{ orderItemId: item.id, quantity: 1 }] }).expect(201);
      const res = await ctx
        .http()
        .post(`/api/orders/${orderId}/void`)
        .set(manager.auth)
        .send({ reason: 'Customer left' })
        .expect(409);
      expect(res.body.code).toBe('HAS_BILLS');
    });
  });

  describe('keeping bills and dishes in step (review fixes)', () => {
    const cancelDish = (orderId: string, itemId: string, quantity: number) =>
      ctx
        .http()
        .post(`/api/orders/${orderId}/items/${itemId}/cancel`)
        .set(manager.auth)
        .send({ reason: 'Customer changed mind', quantity });

    it('refuses to cancel a dish that is already on a bill', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 3 },
      ]);
      const item = (await getOrder(orderId)).items[0];
      await createBill(orderId, { lines: [{ orderItemId: item.id, quantity: 2 }] }).expect(201);
      const res = await cancelDish(orderId, item.id, 2).expect(409);
      expect(res.body.code).toBe('ALREADY_BILLED');
      await cancelDish(orderId, item.id, 1).expect(201);
    });

    it('closes a part-paid order once its last unbilled dishes are cancelled or removed', async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 2 },
      ]);
      const roti = (await getOrder(orderId)).items[0];
      const bill = (
        await createBill(orderId, { lines: [{ orderItemId: roti.id, quantity: 1 }] }).expect(201)
      ).body;
      await payOn(ctx, cashier, bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
      const added = await ctx
        .http()
        .post(`/api/orders/${orderId}/items`)
        .set(waiter.auth)
        .send({ items: [{ variantId: r.paneer.half.id, quantity: 1, addonIds: [] }] })
        .expect(201);
      const paneer = added.body.items.find((i: { status: string }) => i.status === 'NEW');

      await cancelDish(orderId, roti.id, 1).expect(201);
      expect((await getOrder(orderId)).status).toBe('OPEN');
      await ctx
        .http()
        .delete(`/api/orders/${orderId}/items/${paneer.id}`)
        .set(waiter.auth)
        .expect(200);
      expect((await getOrder(orderId)).status).toBe('CLOSED');
    });

    it('does not reopen a voided order onto a merged table that has new guests', async () => {
      const a = await servedOrder(ctx, r, waiter, [{ variantId: r.roti.regular.id, quantity: 1 }]);
      const b = await servedOrder(
        ctx,
        r,
        waiter,
        [{ variantId: r.roti.regular.id, quantity: 1 }],
        r.t2.id,
      );
      await ctx
        .http()
        .post(`/api/orders/${a}/merge`)
        .set(waiter.auth)
        .send({ fromOrderId: b })
        .expect(201);
      const bill = (await createBill(a).expect(201)).body;
      await payOn(ctx, cashier, bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
      await ctx
        .http()
        .post('/api/orders')
        .set(waiter.auth)
        .send({ type: 'DINE_IN', tableId: r.t2.id, guests: 2 })
        .expect(201);
      const res = await ctx
        .http()
        .post(`/api/bills/${bill.id}/void`)
        .set(manager.auth)
        .send({ reason: 'Refund' })
        .expect(409);
      expect(res.body.code).toBe('TABLE_BUSY');
    });
  });

  describe('customer on the bill', () => {
    const setCustomer = (billId: string, body: object, who = cashier) =>
      ctx.http().patch(`/api/bills/${billId}/customer`).set(who.auth).send(body);
    const newBill = async () => {
      const orderId = await servedOrder(ctx, r, waiter, [
        { variantId: r.roti.regular.id, quantity: 1 },
      ]);
      return (await createBill(orderId).expect(201)).body;
    };

    it('starts empty, saves a name and GSTIN, audits it and prints it', async () => {
      const bill = await newBill();
      expect(bill.customer).toEqual({ name: null, gstin: null });
      const res = await setCustomer(bill.id, {
        name: '  Acme Foods ',
        gstin: ' 27abcde1234f1z5 ',
      }).expect(200);
      expect(res.body.customer).toEqual({ name: 'Acme Foods', gstin: '27ABCDE1234F1Z5' });
      const audit = await ctx.prisma.auditEntry.findFirstOrThrow({
        where: { action: 'bill.customer', entityId: bill.id },
      });
      expect(audit.actorId).toBe(cashier.user.id);
      const payload = await ctx
        .http()
        .get(`/api/bills/${bill.id}/print-payload`)
        .set(cashier.auth)
        .expect(200);
      expect(payload.body.customer).toEqual({ name: 'Acme Foods', gstin: '27ABCDE1234F1Z5' });
      const cleared = await setCustomer(bill.id, { name: null, gstin: null }).expect(200);
      expect(cleared.body.customer).toEqual({ name: null, gstin: null });
    });

    it('rejects an invalid GSTIN with 400', async () => {
      const bill = await newBill();
      await setCustomer(bill.id, { gstin: '27ABCDE1234F1Z' }).expect(400);
      await setCustomer(bill.id, { gstin: '99ABCDE1234F1Z5' }).expect(400);
    });

    it('is allowed on a paid bill, but not on a void one', async () => {
      const bill = await newBill();
      await payOn(ctx, cashier, bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
      await setCustomer(bill.id, { name: 'Acme' }).expect(200);
      await ctx
        .http()
        .post(`/api/bills/${bill.id}/void`)
        .set(manager.auth)
        .send({ reason: 'Wrong table' })
        .expect(201);
      const res = await setCustomer(bill.id, { name: 'Late' }).expect(409);
      expect(res.body.code).toBe('BILL_VOID');
    });

    it('is refused once the business day is closed', async () => {
      const bill = await newBill();
      await payOn(ctx, cashier, bill.id, { mode: 'CASH', amount: bill.total }).expect(201);
      await ctx
        .http()
        .post('/api/business-day/close')
        .set(owner.auth)
        .send({ countedCash: 100000 + bill.total })
        .expect(201);
      await setCustomer(bill.id, { name: 'Late' }).expect(409);
    });
  });
});
