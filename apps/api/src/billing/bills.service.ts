import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Bill, DiscountKind, OrderItem, Prisma } from '@prisma/client';
import type { BillDiscountRequest, CreateBillRequest, Permission } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { OverrideService } from '../auth/override.service';
import { BusinessDayService } from '../business-day/business-day.service';
import { CountersService } from '../business-day/counters.service';
import { ApiError } from '../common/api-error';
import { parseVersion } from '../common/if-match';
import { invalidReference, notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { OrdersService, orderNotOpen, tableHolder } from '../orders/orders.service';
import { PrintService } from '../print/print.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculateBill } from './bill-calc';
import { BILL_INCLUDE, billView, type BillView } from './bill.views';
import { financialYear } from './financial-year';
import { billedQuantities, closeOrderIfSettled, settleBill } from './settle';

type Tx = Prisma.TransactionClient;

const discountOf = (kind: DiscountKind | null, value: number | null) =>
  kind && value !== null ? { kind, value } : null;

/**
 * Bills for orders. Every operation runs inside `OrdersService.mutate` on the bill's order, so
 * the order row lock serialises bills, payments and order edits (lock order: order, then bill).
 */
@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly days: BusinessDayService,
    private readonly counters: CountersService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly overrides: OverrideService,
    private readonly print: PrintService,
  ) {}

  async create(
    actor: AuthUser,
    orderId: string,
    ifMatch: string | undefined,
    request: CreateBillRequest,
  ): Promise<BillView & { printQueued: number }> {
    let billId = '';
    await this.orders.mutate(actor, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN' && order.status !== 'BILLED') throw orderNotOpen();
      const items = await tx.orderItem.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
      const waitingQr = await tx.qrSubmission.count({ where: { orderId, status: 'PENDING' } });
      if (waitingQr > 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'QR_PENDING',
          'A customer sent dishes from the table QR. Approve or reject them before the bill.',
        );
      }
      if (items.some((i) => i.status === 'NEW')) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'UNSENT_ITEMS',
          'Send the new dishes to the kitchen first.',
        );
      }
      const billed = await billedQuantities(tx, orderId);
      const sent = items.filter((i) => i.status === 'SENT');
      const left = (item: OrderItem) => item.quantity - (billed.get(item.id) ?? 0);
      const chosen = request.lines
        ? this.chosenLines(sent, request.lines, left)
        : sent.filter((i) => left(i) > 0).map((item) => ({ item, quantity: left(item) }));
      if (chosen.length === 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'NOTHING_TO_BILL',
          'Everything on this order is already billed.',
        );
      }

      const day = await this.days.requireOpen(tx, actor.outletId);
      const outlet = await tx.outlet.findUniqueOrThrow({ where: { id: actor.outletId } });
      const fy = financialYear(new Date());
      const billNo = await this.counters.next(tx, actor.outletId, 'BILL', fy);
      const packagingUsed = await tx.bill.count({
        where: { orderId, status: { not: 'VOID' }, billPackaging: { gt: 0 } },
      });
      const bill = await tx.bill.create({
        data: {
          outletId: actor.outletId,
          businessDayId: day.id,
          orderId,
          billNo,
          financialYear: fy,
          taxScheme: outlet.taxScheme,
          billPackaging:
            order.type === 'PARCEL' && packagingUsed === 0 ? outlet.billPackagingCharge : 0,
          createdById: actor.id,
          // Amounts are written by recalculate() below.
          grossSubtotal: 0,
          itemDiscount: 0,
          subtotal: 0,
          packaging: 0,
          taxable: 0,
          cgst: 0,
          sgst: 0,
          roundOff: 0,
          total: 0,
          items: {
            create: chosen.map(({ item, quantity }, index) => {
              const addons = item.addons as { price: number }[];
              return {
                orderItemId: item.id,
                itemName: item.itemName,
                variantName: item.variantName,
                addons: item.addons as Prisma.InputJsonValue,
                unitPrice: item.unitPrice + addons.reduce((s, a) => s + a.price, 0),
                quantity,
                packagingPerUnit: item.packagingCharge,
                cgstBp: item.cgstBp,
                sgstBp: item.sgstBp,
                gross: 0,
                itemDiscount: 0,
                lineTotal: 0,
                billDiscountShare: 0,
                packaging: 0,
                taxable: 0,
                cgst: 0,
                sgst: 0,
                sortOrder: index,
              };
            }),
          },
        },
      });
      await this.recalculate(tx, bill.id);
      billId = bill.id;

      const billedNow = new Map(chosen.map((c) => [c.item.id, c.quantity]));
      if (sent.every((i) => left(i) - (billedNow.get(i.id) ?? 0) === 0)) {
        await tx.order.update({ where: { id: orderId }, data: { status: 'BILLED' } });
      }
      // A bill for ₹0 (all free dishes) is settled at once.
      if (await settleBill(tx, bill.id)) await closeOrderIfSettled(tx, orderId);
    });
    this.changed(actor.outletId, billId, orderId);
    // Queued here (not through an event) so the counter learns whether a printer took it and
    // prints on screen only when none did; printing it again would make a second copy.
    const printQueued = await this.queueForPrint(billId);
    return { ...(await this.get(actor.outletId, billId)), printQueued };
  }

  async get(outletId: string, billId: string): Promise<BillView> {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, outletId },
      include: BILL_INCLUDE,
    });
    if (!bill) throw notFound('Bill');
    return billView(bill);
  }

  async forOrder(outletId: string, orderId: string): Promise<BillView[]> {
    const bills = await this.prisma.bill.findMany({
      where: { orderId, outletId },
      include: BILL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return bills.map(billView);
  }

  /** Rewrites every amount on the bill and its lines from its stored lines and discounts. */
  async recalculate(tx: Tx, billId: string): Promise<void> {
    const bill = await tx.bill.findUniqueOrThrow({
      where: { id: billId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    const result = calculateBill({
      lines: bill.items.map((i) => ({
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        packagingPerUnit: i.packagingPerUnit,
        cgstBp: i.cgstBp,
        sgstBp: i.sgstBp,
        discount: discountOf(i.discountKind, i.discountValue),
      })),
      billDiscount: discountOf(bill.discountKind, bill.discountValue),
      billPackaging: bill.billPackaging,
      taxScheme: bill.taxScheme,
    });
    for (const [index, item] of bill.items.entries()) {
      const line = result.lines[index]!;
      await tx.billItem.update({
        where: { id: item.id },
        data: {
          gross: line.gross,
          itemDiscount: line.itemDiscount,
          lineTotal: line.lineTotal,
          billDiscountShare: line.billDiscountShare,
          packaging: line.packaging,
          taxable: line.taxable,
          cgst: line.cgst,
          sgst: line.sgst,
        },
      });
    }
    await tx.bill.update({
      where: { id: billId },
      data: {
        grossSubtotal: result.grossSubtotal,
        itemDiscount: result.itemDiscount,
        subtotal: result.subtotal,
        billDiscount: result.billDiscount,
        packaging: result.packaging,
        taxable: result.taxable,
        cgst: result.cgst,
        sgst: result.sgst,
        roundOff: result.roundOff,
        total: result.total,
      },
    });
  }

  /** Locks the bill row for this transaction, bumping its version; `If-Match` → 409 BILL_CHANGED. */
  async lockBill(
    tx: Tx,
    outletId: string,
    billId: string,
    ifMatch: string | undefined,
  ): Promise<Bill> {
    const expected = parseVersion(ifMatch);
    const bumped = await tx.$queryRaw<{ id: string }[]>`
      UPDATE bills SET version = version + 1, updated_at = now()
       WHERE id = ${billId}::uuid AND outlet_id = ${outletId}::uuid
         AND (${expected}::int IS NULL OR version = ${expected}::int)
      RETURNING id`;
    if (bumped.length === 0) {
      const exists = await tx.bill.findFirst({ where: { id: billId, outletId } });
      if (!exists) throw notFound('Bill');
      throw new ApiError(
        HttpStatus.CONFLICT,
        'BILL_CHANGED',
        'Someone else changed this bill. It has been refreshed; check it and try again.',
      );
    }
    return tx.bill.findUniqueOrThrow({ where: { id: billId } });
  }

  /**
   * Voids an open or paid bill (manager, or cashier with override). The number is kept, its
   * payments are refunded and no longer count as sales, and the order reopens for re-billing.
   * `actor` is the approving manager; `requester` the signed-in user.
   */
  async void(
    actor: AuthUser,
    requester: AuthUser,
    billId: string,
    reason: string,
  ): Promise<BillView> {
    const orderId = await this.orderOf(requester.outletId, billId);
    await this.orders.mutate(requester, orderId, undefined, async ({ tx, order }) => {
      const bill = await this.lockBill(tx, requester.outletId, billId, undefined);
      if (bill.status === 'VOID') {
        throw new ApiError(HttpStatus.CONFLICT, 'BILL_ALREADY_VOID', 'This bill is already void.');
      }
      const day = await this.days.requireOpen(tx, requester.outletId);
      if (bill.businessDayId !== day.id) {
        throw new ApiError(HttpStatus.CONFLICT, 'DAY_CLOSED', 'This bill belongs to a closed day.');
      }
      if (order.status === 'CLOSED') {
        // Reopening takes back the order's table and every table merged into it. Lock them
        // (in id order, like seating does) so nobody is seated there at the same moment.
        const merged = await tx.order.findMany({
          where: { mergedIntoId: orderId, tableId: { not: null } },
          select: { tableId: true },
        });
        const tableIds = [
          ...new Set([order.tableId, ...merged.map((m) => m.tableId)].filter((t) => t !== null)),
        ].sort();
        for (const tableId of tableIds) {
          await tx.$queryRaw`SELECT id FROM tables WHERE id = ${tableId}::uuid FOR UPDATE`;
          const holder = await tableHolder(tx, tableId, orderId);
          if (holder) {
            const table = await tx.diningTable.findUniqueOrThrow({ where: { id: tableId } });
            throw new ApiError(
              HttpStatus.CONFLICT,
              'TABLE_BUSY',
              `${table.name} already has a new order. Bill the dishes there instead.`,
              { orderId: holder.id },
            );
          }
        }
      }
      const paid = await tx.payment.aggregate({ where: { billId }, _sum: { amount: true } });
      const voidedAt = new Date();
      await tx.bill.update({
        where: { id: billId },
        data: { status: 'VOID', voidReason: reason, voidedById: actor.id, voidedAt },
      });
      // The customer gets the money back: refunded on the day of the void, which is this
      // open day (a bill can only be voided on its own day).
      await tx.payment.updateMany({
        where: { billId },
        data: { refundedAt: voidedAt, refundedById: actor.id, refundBusinessDayId: day.id },
      });
      if (order.status === 'BILLED' || order.status === 'CLOSED') {
        await tx.order.update({ where: { id: orderId }, data: { status: 'OPEN', closedAt: null } });
      }
      await this.audit.record(
        {
          outletId: requester.outletId,
          actorId: actor.id,
          action: 'bill.void',
          entity: 'bill',
          entityId: billId,
          reason,
          before: {
            billNo: bill.billNo,
            status: bill.status,
            total: bill.total,
            paid: paid._sum.amount ?? 0,
          },
          after: {
            status: 'VOID',
            requestedBy: requester.id,
            refunded: paid._sum.amount ?? 0,
          },
        },
        tx,
      );
    });
    this.changed(requester.outletId, billId, orderId);
    return this.get(requester.outletId, billId);
  }

  /** The bill's order id, checked against the outlet (for locking the order first). */
  async orderOf(outletId: string, billId: string): Promise<string> {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, outletId },
      select: { orderId: true },
    });
    if (!bill) throw notFound('Bill');
    return bill.orderId;
  }

  /**
   * Sets the bill discount and/or line discounts, then recalculates. A cashier above the
   * outlet cap needs a manager override for `discount.unlimited`; the approver is audited.
   */
  async setDiscount(
    user: AuthUser,
    permissions: readonly Permission[],
    billId: string,
    ifMatch: string | undefined,
    overrideToken: string | undefined,
    request: BillDiscountRequest,
  ): Promise<BillView> {
    const orderId = await this.orderOf(user.outletId, billId);
    await this.orders.mutate(user, orderId, undefined, async ({ tx }) => {
      const locked = await this.lockBill(tx, user.outletId, billId, ifMatch);
      if (locked.status !== 'OPEN') {
        throw new ApiError(HttpStatus.CONFLICT, 'BILL_NOT_OPEN', 'This bill is already settled.');
      }
      if ((await tx.payment.count({ where: { billId } })) > 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'BILL_HAS_PAYMENTS',
          'Discounts can only change before any payment is taken.',
        );
      }
      const before = await tx.bill.findUniqueOrThrow({
        where: { id: billId },
        include: { items: true },
      });
      for (const entry of request.items) {
        if (!before.items.some((i) => i.id === entry.billItemId)) {
          throw invalidReference('billItemId');
        }
        await tx.billItem.update({
          where: { id: entry.billItemId },
          data: {
            discountKind: entry.discount?.kind ?? null,
            discountValue: entry.discount?.value ?? null,
          },
        });
      }
      if (request.bill !== undefined) {
        await tx.bill.update({
          where: { id: billId },
          data: {
            discountKind: request.bill?.kind ?? null,
            discountValue: request.bill?.value ?? null,
          },
        });
      }
      await this.recalculate(tx, billId);
      const after = await tx.bill.findUniqueOrThrow({
        where: { id: billId },
        include: { items: true },
      });

      const totalDiscount = after.itemDiscount + after.billDiscount;
      const reason = request.reason?.trim() ?? '';
      if (totalDiscount > 0 && reason.length < 3) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Give a reason for the discount.');
      }
      let approver: AuthUser = user;
      const outlet = await tx.outlet.findUniqueOrThrow({ where: { id: user.outletId } });
      const allowed = Math.floor((after.grossSubtotal * outlet.cashierDiscountCapBp) / 10000);
      if (totalDiscount > allowed && !permissions.includes('discount.unlimited')) {
        const manager = overrideToken
          ? await this.overrides.approve(overrideToken, 'discount.unlimited', user)
          : null;
        if (!manager) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            'DISCOUNT_OVER_LIMIT',
            'This discount needs a manager.',
            { capBp: outlet.cashierDiscountCapBp, allowed },
          );
        }
        approver = manager;
      }
      await tx.bill.update({
        where: { id: billId },
        data: {
          discountReason: totalDiscount > 0 ? reason : null,
          discountById: totalDiscount > 0 ? approver.id : null,
        },
      });
      const snapshot = (b: typeof before) => ({
        discount: b.discountKind ? { kind: b.discountKind, value: b.discountValue } : null,
        itemDiscounts: b.items
          .filter((i) => i.discountKind)
          .map((i) => ({ itemName: i.itemName, kind: i.discountKind, value: i.discountValue })),
        total: b.total,
      });
      await this.audit.record(
        {
          outletId: user.outletId,
          actorId: approver.id,
          action: 'bill.discount',
          entity: 'bill',
          entityId: billId,
          reason: reason || null,
          before: snapshot(before),
          after: {
            ...snapshot(after),
            ...(approver.id !== user.id ? { requestedBy: user.id } : {}),
          },
        },
        tx,
      );
      // A 100% discount leaves nothing to collect.
      if (await settleBill(tx, billId)) await closeOrderIfSettled(tx, orderId);
    });
    this.changed(user.outletId, billId, orderId);
    return this.get(user.outletId, billId);
  }

  /**
   * Queues the bill on the bill printers again (paper jam, customer copy). `queued: 0` means
   * no bill printer is set up, so the counter prints it from the screen instead.
   */
  async reprint(user: AuthUser, billId: string) {
    await this.orderOf(user.outletId, billId);
    return { id: billId, queued: await this.print.queueBillJobs(billId) };
  }

  /** Queues a new bill on the bill printers; a print problem never fails billing (§5.6.4). */
  private async queueForPrint(billId: string): Promise<number> {
    try {
      return await this.print.queueBillJobs(billId);
    } catch (error) {
      this.logger.error(`Could not queue print for bill ${billId}: ${String(error)}`);
      return 0;
    }
  }

  /** The printable bill for printing on this screen. */
  async printPayload(user: AuthUser, billId: string, paperWidthMm: number) {
    await this.orderOf(user.outletId, billId);
    return this.print.buildBillPayload(billId, paperWidthMm);
  }

  changed(outletId: string, billId: string, orderId: string) {
    this.events.emit('bill.updated', { outletId, billId, orderId });
  }

  private chosenLines(
    sent: OrderItem[],
    lines: { orderItemId: string; quantity: number }[],
    left: (item: OrderItem) => number,
  ) {
    if (new Set(lines.map((l) => l.orderItemId)).size !== lines.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Each dish can be listed once.');
    }
    return lines.map((line) => {
      const item = sent.find((i) => i.id === line.orderItemId);
      if (!item) throw invalidReference('orderItemId');
      if (line.quantity > left(item)) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'ALREADY_BILLED',
          `Only ${left(item)} × ${item.itemName} is left to bill.`,
          { orderItemId: item.id },
        );
      }
      return { item, quantity: line.quantity };
    });
  }
}
