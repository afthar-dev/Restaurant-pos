import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type BusinessDay, type PaymentMode } from '@prisma/client';
import { closeCountTotal, type CloseCount, type CloseDayRequest } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { gstLinesOf, gstSummary } from '../billing/gst-summary';
import { cashMovementTotals } from '../cash/cash-totals';
import { ApiError } from '../common/api-error';
import { notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { cashExpenses, expenseTotals } from '../expenses/expense-totals';
import { ACTIVE_STATUSES } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessDayService, dayNotOpen } from './business-day.service';

type Db = Pick<
  PrismaService,
  | 'bill'
  | 'order'
  | 'orderItem'
  | 'businessDay'
  | 'user'
  | 'expense'
  | 'payment'
  | 'outlet'
  | 'cashMovement'
>;

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Closing the business day with a cash tally (spec §5.5), the day report and owner reopen. */
@Injectable()
export class DayCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly days: BusinessDayService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** What stops the close right now, and the cash the drawer should hold. */
  async closeCheck(outletId: string, blind = false) {
    const day = await this.prisma.businessDay.findFirst({ where: { outletId, status: 'OPEN' } });
    if (!day) throw dayNotOpen();
    const blockers = await this.blockers(this.prisma, day.id);
    // The closing screen asks for a blind count: nothing that adds up to the expected figure.
    if (blind) {
      return { day: { id: day.id, openingCash: day.openingCash }, blockers, cash: {} };
    }
    const cash = await this.expectedCash(this.prisma, day);
    return { day: { id: day.id, openingCash: day.openingCash }, blockers, cash };
  }

  /**
   * What closing would show for a counted figure, once the manager has counted: the expected
   * cash, the variance and whether the variance needs a reason. Changes and records nothing.
   */
  async checkCount(outletId: string, dayId: string, countedCash: number) {
    const day = await this.prisma.businessDay.findFirst({
      where: { id: dayId, outletId, status: 'OPEN' },
    });
    if (!day) throw dayNotOpen();
    // The first count checked is kept, once, so a later re-count that matches is still visible.
    await this.prisma.businessDay.updateMany({
      where: { id: day.id, firstCountedCash: null },
      data: { firstCountedCash: countedCash },
    });
    const { expected } = await this.expectedCash(this.prisma, day);
    const variance = countedCash - expected;
    const outlet = await this.prisma.outlet.findUniqueOrThrow({ where: { id: outletId } });
    return { expected, variance, needsReason: Math.abs(variance) > outlet.varianceAlertPaise };
  }

  async close(actor: AuthUser, request: CloseDayRequest) {
    if (request.count && closeCountTotal(request.count) !== request.countedCash) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'COUNT_MISMATCH',
        'The notes and coins do not add up to the counted cash.',
      );
    }
    const dayId = await this.prisma.$transaction(async (tx) => {
      // Waits for any order, bill or payment still being written on the day (they hold a
      // share lock from requireOpen), so the checks below see everything.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM business_days
         WHERE outlet_id = ${actor.outletId}::uuid AND status = 'OPEN'
         FOR UPDATE`;
      if (rows.length === 0) throw dayNotOpen();
      const day = await tx.businessDay.findUniqueOrThrow({ where: { id: rows[0]!.id } });
      const blockers = await this.blockers(tx, day.id);
      if (blockers.orders.length > 0 || blockers.bills.length > 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'DAY_HAS_OPEN_WORK',
          'Finish or cancel the open orders and settle every bill before closing the day.',
          { blockers },
        );
      }
      const { expected } = await this.expectedCash(tx, day);
      const variance = request.countedCash - expected;
      const outlet = await tx.outlet.findUniqueOrThrow({ where: { id: actor.outletId } });
      if (!request.reasonCode && Math.abs(variance) > outlet.varianceAlertPaise) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'REASON_REQUIRED',
          'The cash is out by more than the allowed amount. Say why.',
        );
      }
      await tx.businessDay.update({
        where: { id: day.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: actor.id,
          expectedCash: expected,
          countedCash: request.countedCash,
          variance,
          closeNote: request.note || null,
          closeReasonCode: request.reasonCode ?? null,
          closeCount: request.count ?? Prisma.DbNull,
        },
      });
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: 'day.close',
          entity: 'business_day',
          entityId: day.id,
          reason: request.note || null,
          after: {
            expected,
            counted: request.countedCash,
            variance,
            ...(request.reasonCode ? { reasonCode: request.reasonCode } : {}),
            ...(request.count ? { count: request.count } : {}),
            ...(day.firstCountedCash !== null && day.firstCountedCash !== request.countedCash
              ? { firstCount: day.firstCountedCash }
              : {}),
          },
        },
        tx,
      );
      return day.id;
    });
    this.events.emit('day.updated', { outletId: actor.outletId });
    return this.report(actor.outletId, dayId);
  }

  /** Owner only: reopens the most recent closed day (a bill was missed, cash recounted). */
  async reopen(actor: AuthUser, dayId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      // Same lock as opening a day: one open day per outlet.
      await tx.$queryRaw`SELECT id FROM outlets WHERE id = ${actor.outletId}::uuid FOR UPDATE`;
      const day = await tx.businessDay.findFirst({
        where: { id: dayId, outletId: actor.outletId },
      });
      if (!day) throw notFound('Business day');
      if (day.status !== 'CLOSED') {
        throw new ApiError(HttpStatus.CONFLICT, 'DAY_NOT_CLOSED', 'This day is not closed.');
      }
      const open = await tx.businessDay.count({
        where: { outletId: actor.outletId, status: 'OPEN' },
      });
      if (open > 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'DAY_ALREADY_OPEN',
          'Another business day is open. Close it first.',
        );
      }
      const latest = await tx.businessDay.findFirst({
        where: { outletId: actor.outletId },
        orderBy: { openedAt: 'desc' },
      });
      if (latest?.id !== day.id) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'NOT_LATEST_DAY',
          'Only the most recent day can be reopened.',
        );
      }
      await tx.businessDay.update({
        where: { id: day.id },
        data: {
          status: 'OPEN',
          closedAt: null,
          closedById: null,
          expectedCash: null,
          countedCash: null,
          variance: null,
          closeNote: null,
          closeReasonCode: null,
          firstCountedCash: null,
          closeCount: Prisma.DbNull,
        },
      });
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: 'day.reopen',
          entity: 'business_day',
          entityId: day.id,
          reason,
          before: {
            closedAt: day.closedAt?.toISOString() ?? null,
            closedById: day.closedById,
            expectedCash: day.expectedCash,
            countedCash: day.countedCash,
            variance: day.variance,
            closeReasonCode: day.closeReasonCode,
            firstCount: day.firstCountedCash,
            closeCount: day.closeCount ?? null,
          },
        },
        tx,
      );
    });
    this.events.emit('day.updated', { outletId: actor.outletId });
    const { day } = await this.days.current(actor.outletId);
    return day!;
  }

  /** Recent days, newest first, with their sales total. */
  async list(outletId: string, limit: number) {
    const days = await this.prisma.businessDay.findMany({
      where: { outletId },
      orderBy: { openedAt: 'desc' },
      take: limit,
    });
    const totals = await this.prisma.bill.groupBy({
      by: ['businessDayId'],
      where: { businessDayId: { in: days.map((d) => d.id) }, status: { not: 'VOID' } },
      _sum: { total: true },
    });
    const totalOf = new Map(totals.map((t) => [t.businessDayId, t._sum.total ?? 0]));
    const paid = await this.prisma.payment.groupBy({
      by: ['businessDayId'],
      where: { businessDayId: { in: days.map((d) => d.id) }, bill: { status: { not: 'VOID' } } },
      _sum: { amount: true },
    });
    const collectedOf = new Map(paid.map((p) => [p.businessDayId, p._sum.amount ?? 0]));
    return days.map((d) => ({
      id: d.id,
      status: d.status,
      openedAt: d.openedAt,
      closedAt: d.closedAt,
      openingCash: d.openingCash,
      expectedCash: d.expectedCash,
      countedCash: d.countedCash,
      variance: d.variance,
      total: totalOf.get(d.id) ?? 0,
      // Sales are billed; collected is what has been paid on those bills.
      collected: collectedOf.get(d.id) ?? 0,
      unpaid: (totalOf.get(d.id) ?? 0) - (collectedOf.get(d.id) ?? 0),
    }));
  }

  /** The day-close report (spec §5.5.5). Void bills only appear under `voids`. */
  async report(outletId: string, dayId: string) {
    const day = await this.prisma.businessDay.findFirst({
      where: { id: dayId, outletId },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
    if (!day) throw notFound('Business day');
    const bills = await this.prisma.bill.findMany({
      where: { businessDayId: day.id },
      include: {
        items: { include: { orderItem: { select: { itemId: true, variantId: true } } } },
        payments: true,
        order: { select: { type: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { billNo: 'asc' }],
    });
    const live = bills.filter((b) => b.status !== 'VOID');
    const voided = bills.filter((b) => b.status === 'VOID');

    // Payments are shown as received on the day, including those on bills voided since;
    // the refunds are listed apart, on the day the void happened.
    const payments = { CASH: 0, UPI: 0, CARD: 0 };
    for (const b of bills) {
      for (const p of b.payments) {
        if (b.status !== 'VOID' || p.refundedAt) payments[p.mode] += p.amount;
      }
    }
    const refundRows = await this.prisma.payment.findMany({
      where: { refundBusinessDayId: day.id },
      include: { bill: { select: { billNo: true } }, refundedBy: { select: { name: true } } },
      orderBy: { refundedAt: 'asc' },
    });
    const refunds = { total: 0, CASH: 0, UPI: 0, CARD: 0 };
    const refundedBills = new Map<
      string,
      { billNo: number; amount: number; modes: PaymentMode[]; by: string | null }
    >();
    for (const p of refundRows) {
      refunds.total += p.amount;
      refunds[p.mode] += p.amount;
      const row = refundedBills.get(p.billId) ?? {
        billNo: p.bill.billNo,
        amount: 0,
        modes: [],
        by: p.refundedBy?.name ?? null,
      };
      row.amount += p.amount;
      if (!row.modes.includes(p.mode)) row.modes.push(p.mode);
      refundedBills.set(p.billId, row);
    }

    const byType = { DINE_IN: { orders: 0, total: 0 }, PARCEL: { orders: 0, total: 0 } };
    for (const type of ['DINE_IN', 'PARCEL'] as const) {
      const ofType = live.filter((b) => b.order.type === type);
      byType[type] = {
        orders: new Set(ofType.map((b) => b.orderId)).size,
        total: sum(ofType.map((b) => b.total)),
      };
    }

    // One row per dish and portion, under its name today (an archived one keeps the name on
    // its latest bill, which comes last as the bills are in the order they were made).
    const lines = live.flatMap((b) => b.items);
    const [dishes, portions] = await Promise.all([
      this.prisma.item.findMany({
        where: { id: { in: lines.map((l) => l.orderItem.itemId) } },
        select: { id: true, name: true, archivedAt: true },
      }),
      this.prisma.itemVariant.findMany({
        where: { id: { in: lines.map((l) => l.orderItem.variantId) } },
        select: { id: true, name: true, archivedAt: true },
      }),
    ]);
    const dishOf = new Map(dishes.map((d) => [d.id, d]));
    const portionOf = new Map(portions.map((v) => [v.id, v]));
    const items = new Map<
      string,
      { itemName: string; variantName: string; quantity: number; amount: number }
    >();
    for (const line of lines) {
      const dish = dishOf.get(line.orderItem.itemId);
      const portion = portionOf.get(line.orderItem.variantId);
      const key = `${line.orderItem.itemId}\u0000${line.orderItem.variantId}`;
      const row = items.get(key) ?? { itemName: '', variantName: '', quantity: 0, amount: 0 };
      row.itemName = dish && !dish.archivedAt ? dish.name : line.itemName;
      row.variantName = portion && !portion.archivedAt ? portion.name : line.variantName;
      row.quantity += line.quantity;
      row.amount += line.lineTotal;
      items.set(key, row);
    }
    const topItems = [...items.values()]
      // By amount, as on the sales report, then by quantity.
      .sort(
        (a, b) =>
          b.amount - a.amount || b.quantity - a.quantity || a.itemName.localeCompare(b.itemName),
      )
      .slice(0, 10);

    const voiders = await this.prisma.user.findMany({
      where: { id: { in: voided.flatMap((b) => (b.voidedById ? [b.voidedById] : [])) } },
      select: { id: true, name: true },
    });
    const cancelled = await this.prisma.orderItem.findMany({
      where: { order: { businessDayId: day.id }, status: 'CANCELLED', kotId: { not: null } },
      orderBy: { updatedAt: 'asc' },
    });

    const reopened = await this.lastReopen(outletId, day.id);

    const gst = gstSummary(live.flatMap((b) => gstLinesOf(b)));
    // What is kept: received on the day less what was refunded on it.
    const collected = payments.CASH + payments.UPI + payments.CARD - refunds.total;
    const billed = sum(live.map((b) => b.total));
    const spent = await expenseTotals(this.prisma, day.id);
    // The same figures and formula as the close check and the close.
    const drawer = await this.expectedCash(this.prisma, day);
    const expected = day.expectedCash ?? drawer.expected;
    const movements = await this.prisma.cashMovement.findMany({
      where: { businessDayId: day.id },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // UPI and card payments that still stand, with and without a reference to match against
    // the bank or card statement. Refunded payments are left out.
    const reconciliation = {
      upi: { withRef: 0, withoutRef: 0, amountWithout: 0 },
      card: { withRef: 0, withoutRef: 0, amountWithout: 0 },
      missing: [] as { billNo: number; mode: PaymentMode; amount: number; at: Date }[],
    };
    for (const b of bills) {
      if (b.status === 'VOID') continue;
      for (const p of b.payments) {
        if (p.mode === 'CASH' || p.refundedAt) continue;
        const figure = p.mode === 'UPI' ? reconciliation.upi : reconciliation.card;
        if (p.reference) {
          figure.withRef += 1;
        } else {
          figure.withoutRef += 1;
          figure.amountWithout += p.amount;
          reconciliation.missing.push({
            billNo: b.billNo,
            mode: p.mode,
            amount: p.amount,
            at: p.createdAt,
          });
        }
      }
    }
    return {
      day: {
        id: day.id,
        status: day.status,
        openedAt: day.openedAt,
        closedAt: day.closedAt,
        openedBy: day.openedBy,
        closedBy: day.closedBy,
        closeNote: day.closeNote,
        closeCount: day.closeCount as CloseCount | null,
        closeReasonCode: day.closeReasonCode,
        // Only when the first count checked was not the count the day closed with.
        firstCount:
          day.firstCountedCash !== null && day.firstCountedCash !== day.countedCash
            ? day.firstCountedCash
            : null,
      },
      sales: {
        bills: live.length,
        grossSubtotal: sum(live.map((b) => b.grossSubtotal)),
        discounts: sum(live.map((b) => b.itemDiscount + b.billDiscount)),
        packaging: sum(live.map((b) => b.packaging)),
        // Sales that carry GST; No-GST sales are `exempt`.
        taxable: gst.taxable,
        exempt: gst.exempt,
        gstBreakup: gst.rates,
        cgst: sum(live.map((b) => b.cgst)),
        sgst: sum(live.map((b) => b.sgst)),
        roundOff: sum(live.map((b) => b.roundOff)),
        total: billed,
        // Sales are billed; collected is what has been paid on those bills.
        collected,
        unpaid: billed - collected,
      },
      reopened,
      payments,
      reconciliation,
      refunds: { ...refunds, bills: [...refundedBills.values()] },
      byType,
      topItems,
      voids: voided.map((b) => ({
        billNo: b.billNo,
        total: b.total,
        reason: b.voidReason,
        by: voiders.find((u) => u.id === b.voidedById)?.name ?? null,
      })),
      cancels: cancelled.map((i) => ({
        itemName: i.itemName,
        quantity: i.quantity,
        reason: i.cancelReason,
      })),
      // The first print is the original; every one after it is a reprint.
      reprints: bills
        .filter((b) => b.printCount > 1)
        .map((b) => ({ billNo: b.billNo, count: b.printCount - 1 })),
      discounts: live
        .filter((b) => b.itemDiscount + b.billDiscount > 0)
        .map((b) => ({
          billNo: b.billNo,
          amount: b.itemDiscount + b.billDiscount,
          reason: b.discountReason,
        })),
      expenses: { total: spent.total, cash: spent.cash, byCategory: spent.byCategory },
      cashMovements: {
        totals: { payIn: drawer.payIns, payOut: drawer.payOuts, drop: drawer.drops },
        list: movements.map((m) => ({
          at: m.createdAt,
          type: m.type,
          amount: m.amount,
          reasonCode: m.reasonCode,
          note: m.note,
          by: m.createdBy.name,
        })),
      },
      cash: {
        opening: day.openingCash,
        cashSales: drawer.cashSales,
        cashRefunds: drawer.cashRefunds,
        cashExpenses: drawer.cashExpenses,
        payIns: drawer.payIns,
        payOuts: drawer.payOuts,
        drops: drawer.drops,
        expected,
        counted: day.countedCash,
        variance: day.variance,
      },
    };
  }

  /** The latest reopen of the day, with the close figures it replaced (from the audit log). */
  private async lastReopen(outletId: string, dayId: string) {
    const entry = await this.prisma.auditEntry.findFirst({
      where: { outletId, action: 'day.reopen', entity: 'business_day', entityId: dayId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true } } },
    });
    if (!entry) return null;
    const before = (entry.before ?? {}) as {
      closedAt?: string | null;
      closedById?: string | null;
      expectedCash?: number | null;
      countedCash?: number | null;
      variance?: number | null;
    };
    const closer = before.closedById
      ? await this.prisma.user.findUnique({
          where: { id: before.closedById },
          select: { name: true },
        })
      : null;
    return {
      by: entry.actor?.name ?? null,
      at: entry.createdAt,
      reason: entry.reason,
      earlier: {
        closedAt: before.closedAt ?? null,
        closedBy: closer?.name ?? null,
        counted: before.countedCash ?? null,
        expected: before.expectedCash ?? null,
        variance: before.variance ?? null,
      },
    };
  }

  private async blockers(db: Pick<Db, 'order' | 'bill'>, dayId: string) {
    const orders = await db.order.findMany({
      where: { businessDayId: dayId, status: { in: [...ACTIVE_STATUSES] } },
      include: { table: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const bills = await db.bill.findMany({
      where: { businessDayId: dayId, status: 'OPEN' },
      include: { payments: { select: { amount: true } } },
      orderBy: [{ createdAt: 'asc' }, { billNo: 'asc' }],
    });
    return {
      orders: orders.map((o) => ({
        id: o.id,
        label: o.table?.name ?? `Parcel #${o.tokenNo ?? '?'}`,
        status: o.status,
      })),
      bills: bills.map((b) => ({
        id: b.id,
        orderId: b.orderId,
        billNo: b.billNo,
        due: b.total - sum(b.payments.map((p) => p.amount)),
      })),
    };
  }

  /**
   * The one place expected cash is worked out (spec §5.5.4, P5): opening + cash payments − cash
   * refunded − cash expenses + pay-ins − pay-outs − drops. The close check, the count check, the
   * close and the day report all use it.
   */
  private async expectedCash(
    db: Pick<Db, 'payment' | 'expense' | 'cashMovement'>,
    day: Pick<BusinessDay, 'id' | 'openingCash'>,
  ) {
    const cashSales = await this.cashSales(db, day.id);
    const cashRefunds = await this.cashRefunds(db, day.id);
    const spent = await cashExpenses(db, day.id);
    const moved = await cashMovementTotals(db, day.id);
    return {
      opening: day.openingCash,
      cashSales,
      cashRefunds,
      cashExpenses: spent,
      payIns: moved.payIn,
      payOuts: moved.payOut,
      drops: moved.drop,
      expected:
        day.openingCash + cashSales - cashRefunds - spent + moved.payIn - moved.payOut - moved.drop,
    };
  }

  /**
   * Cash received on the day: payments on live bills, and on bills voided since (those come
   * back off as refunds). A legacy void bill with no refund record is not counted.
   */
  private async cashSales(db: Pick<Db, 'payment'>, dayId: string): Promise<number> {
    const total = await db.payment.aggregate({
      where: {
        businessDayId: dayId,
        mode: 'CASH',
        OR: [{ bill: { status: { not: 'VOID' } } }, { refundedAt: { not: null } }],
      },
      _sum: { amount: true },
    });
    return total._sum.amount ?? 0;
  }

  /** Cash handed back on the day, by voiding paid bills. */
  private async cashRefunds(db: Pick<Db, 'payment'>, dayId: string): Promise<number> {
    const total = await db.payment.aggregate({
      where: { refundBusinessDayId: dayId, mode: 'CASH' },
      _sum: { amount: true },
    });
    return total._sum.amount ?? 0;
  }
}
