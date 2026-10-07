import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CloseDayRequest } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { cashExpenses, expenseTotals } from '../expenses/expense-totals';
import { ACTIVE_STATUSES } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessDayService, dayNotOpen } from './business-day.service';

type Db = Pick<PrismaService, 'bill' | 'order' | 'orderItem' | 'businessDay' | 'user' | 'expense'>;

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
  async closeCheck(outletId: string) {
    const day = await this.prisma.businessDay.findFirst({ where: { outletId, status: 'OPEN' } });
    if (!day) throw dayNotOpen();
    const blockers = await this.blockers(this.prisma, day.id);
    const cashSales = await this.cashSales(this.prisma, day.id);
    const spent = await cashExpenses(this.prisma, day.id);
    return {
      day: { id: day.id, openingCash: day.openingCash },
      blockers,
      cash: {
        opening: day.openingCash,
        cashSales,
        cashExpenses: spent,
        expected: day.openingCash + cashSales - spent,
      },
    };
  }

  async close(actor: AuthUser, request: CloseDayRequest) {
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
      // Expected cash = opening + cash payments − cash expenses (spec §5.5.4).
      const expected =
        day.openingCash + (await this.cashSales(tx, day.id)) - (await cashExpenses(tx, day.id));
      const variance = request.countedCash - expected;
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
          after: { expected, counted: request.countedCash, variance },
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
            expectedCash: day.expectedCash,
            countedCash: day.countedCash,
            variance: day.variance,
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
      include: { items: true, payments: true, order: { select: { type: true } } },
      orderBy: { billNo: 'asc' },
    });
    const live = bills.filter((b) => b.status !== 'VOID');
    const voided = bills.filter((b) => b.status === 'VOID');

    const payments = { CASH: 0, UPI: 0, CARD: 0 };
    for (const p of live.flatMap((b) => b.payments)) payments[p.mode] += p.amount;

    const byType = { DINE_IN: { orders: 0, total: 0 }, PARCEL: { orders: 0, total: 0 } };
    for (const type of ['DINE_IN', 'PARCEL'] as const) {
      const ofType = live.filter((b) => b.order.type === type);
      byType[type] = {
        orders: new Set(ofType.map((b) => b.orderId)).size,
        total: sum(ofType.map((b) => b.total)),
      };
    }

    const items = new Map<
      string,
      { itemName: string; variantName: string; quantity: number; amount: number }
    >();
    for (const line of live.flatMap((b) => b.items)) {
      const key = `${line.itemName}\u0000${line.variantName}`;
      const row = items.get(key) ?? {
        itemName: line.itemName,
        variantName: line.variantName,
        quantity: 0,
        amount: 0,
      };
      row.quantity += line.quantity;
      row.amount += line.lineTotal;
      items.set(key, row);
    }
    const topItems = [...items.values()]
      .sort((a, b) => b.quantity - a.quantity || b.amount - a.amount)
      .slice(0, 10);

    const voiders = await this.prisma.user.findMany({
      where: { id: { in: voided.flatMap((b) => (b.voidedById ? [b.voidedById] : [])) } },
      select: { id: true, name: true },
    });
    const cancelled = await this.prisma.orderItem.findMany({
      where: { order: { businessDayId: day.id }, status: 'CANCELLED', kotId: { not: null } },
      orderBy: { updatedAt: 'asc' },
    });

    const cashSales = payments.CASH;
    const spent = await expenseTotals(this.prisma, day.id);
    const expected = day.expectedCash ?? day.openingCash + cashSales - spent.cash;
    return {
      day: {
        id: day.id,
        status: day.status,
        openedAt: day.openedAt,
        closedAt: day.closedAt,
        openedBy: day.openedBy,
        closedBy: day.closedBy,
        closeNote: day.closeNote,
      },
      sales: {
        bills: live.length,
        grossSubtotal: sum(live.map((b) => b.grossSubtotal)),
        discounts: sum(live.map((b) => b.itemDiscount + b.billDiscount)),
        packaging: sum(live.map((b) => b.packaging)),
        taxable: sum(live.map((b) => b.taxable)),
        cgst: sum(live.map((b) => b.cgst)),
        sgst: sum(live.map((b) => b.sgst)),
        roundOff: sum(live.map((b) => b.roundOff)),
        total: sum(live.map((b) => b.total)),
      },
      payments,
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
      discounts: live
        .filter((b) => b.itemDiscount + b.billDiscount > 0)
        .map((b) => ({
          billNo: b.billNo,
          amount: b.itemDiscount + b.billDiscount,
          reason: b.discountReason,
        })),
      expenses: { total: spent.total, cash: spent.cash, byCategory: spent.byCategory },
      cash: {
        opening: day.openingCash,
        cashSales,
        cashExpenses: spent.cash,
        expected,
        counted: day.countedCash,
        variance: day.variance,
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
      orderBy: { billNo: 'asc' },
    });
    return {
      orders: orders.map((o) => ({
        id: o.id,
        label: o.table?.name ?? `Parcel #${o.tokenNo ?? '?'}`,
        status: o.status,
      })),
      bills: bills.map((b) => ({
        id: b.id,
        billNo: b.billNo,
        due: b.total - sum(b.payments.map((p) => p.amount)),
      })),
    };
  }

  /** Cash received on the day's live bills. */
  private async cashSales(db: Pick<Db, 'bill'>, dayId: string): Promise<number> {
    const bills = await db.bill.findMany({
      where: { businessDayId: dayId, status: { not: 'VOID' } },
      select: { payments: { where: { mode: 'CASH' }, select: { amount: true } } },
    });
    return sum(bills.flatMap((b) => b.payments.map((p) => p.amount)));
  }
}
