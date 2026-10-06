import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Bill, DiscountKind, OrderItem, Prisma } from '@prisma/client';
import type { CreateBillRequest } from '@rpos/shared';
import { BusinessDayService } from '../business-day/business-day.service';
import { CountersService } from '../business-day/counters.service';
import { ApiError } from '../common/api-error';
import { parseVersion } from '../common/if-match';
import { invalidReference, notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { OrdersService, orderNotOpen } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculateBill } from './bill-calc';
import { BILL_INCLUDE, billView, type BillView } from './bill.views';
import { financialYear } from './financial-year';

type Tx = Prisma.TransactionClient;

/** Quantity of each order item already on a non-void bill. */
export async function billedQuantities(tx: Tx, orderId: string): Promise<Map<string, number>> {
  const rows = await tx.billItem.groupBy({
    by: ['orderItemId'],
    where: { bill: { orderId, status: { not: 'VOID' } } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.orderItemId, r._sum.quantity ?? 0]));
}

const discountOf = (kind: DiscountKind | null, value: number | null) =>
  kind && value !== null ? { kind, value } : null;

/**
 * Bills for orders. Every operation runs inside `OrdersService.mutate` on the bill's order, so
 * the order row lock serialises bills, payments and order edits (lock order: order, then bill).
 */
@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly days: BusinessDayService,
    private readonly counters: CountersService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    actor: AuthUser,
    orderId: string,
    ifMatch: string | undefined,
    request: CreateBillRequest,
  ): Promise<BillView> {
    let billId = '';
    await this.orders.mutate(actor, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN' && order.status !== 'BILLED') throw orderNotOpen();
      const items = await tx.orderItem.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
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
    });
    this.changed(actor.outletId, billId, orderId);
    return this.get(actor.outletId, billId);
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

  /** The bill's order id, checked against the outlet (for locking the order first). */
  async orderOf(outletId: string, billId: string): Promise<string> {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, outletId },
      select: { orderId: true },
    });
    if (!bill) throw notFound('Bill');
    return bill.orderId;
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
