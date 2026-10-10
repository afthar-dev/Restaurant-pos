import { Injectable } from '@nestjs/common';
import { Prisma, type BusinessDayStatus, type OrderType, type PaymentMode } from '@prisma/client';
import type { ReportRange } from '@rpos/shared';
import { notFound } from '../common/master-data';
import { gstSummary } from '../billing/gst-summary';
import { PrismaService } from '../prisma/prisma.service';

const TIME_ZONE = 'Asia/Kolkata';

type DayRow = { id: string; date: string; status: BusinessDayStatus };

type Modes = Record<PaymentMode, number>;
const noModes = (): Modes => ({ CASH: 0, UPI: 0, CARD: 0 });

type DayFigures = {
  dayId: string;
  date: string;
  status: BusinessDayStatus;
  bills: number;
  total: number;
  collected: number;
  unpaid: number;
  cash: number;
  upi: number;
  card: number;
  expenses: number;
};

/**
 * One entry per India date: two business days opened on the same date (lunch closed, dinner
 * opened) add up. The entry carries the id and status of the latest of them; `days` are in
 * the order they were opened.
 */
function perDate(days: DayFigures[]): DayFigures[] {
  const byDate = new Map<string, DayFigures>();
  for (const d of days) {
    const row = byDate.get(d.date);
    if (!row) {
      byDate.set(d.date, { ...d });
      continue;
    }
    row.dayId = d.dayId;
    row.status = d.status;
    row.bills += d.bills;
    row.total += d.total;
    row.collected += d.collected;
    row.unpaid += d.unpaid;
    row.cash += d.cash;
    row.upi += d.upi;
    row.card += d.card;
    row.expenses += d.expenses;
  }
  return [...byDate.values()];
}

/**
 * Sales over a date range (spec §1.2 #12): the business days opened on those dates in India,
 * their non-void bills, payments and expenses. Read-only.
 */
@Injectable()
export class SalesReportService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(outletId: string, range: ReportRange) {
    const days = await this.prisma.$queryRaw<DayRow[]>`
      SELECT id, to_char(opened_at AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM-DD') AS date, status
        FROM business_days
       WHERE outlet_id = ${outletId}::uuid
         AND (opened_at AT TIME ZONE ${TIME_ZONE})::date BETWEEN ${range.from}::date AND ${range.to}::date
       ORDER BY opened_at`;
    return this.summarise(range, days);
  }

  /** One business day, by id: its figures stay together when it runs past midnight. */
  async salesOfDay(outletId: string, businessDayId: string) {
    const days = await this.prisma.$queryRaw<DayRow[]>`
      SELECT id, to_char(opened_at AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM-DD') AS date, status
        FROM business_days
       WHERE outlet_id = ${outletId}::uuid AND id = ${businessDayId}::uuid`;
    if (days.length === 0) throw notFound('Business day');
    return this.summarise({ from: days[0]!.date, to: days[0]!.date }, days);
  }

  private async summarise(range: ReportRange, days: DayRow[]) {
    const dayIds = days.map((d) => d.id);
    const live = { businessDayId: { in: dayIds }, status: { not: 'VOID' as const } };

    const [billTotals, billsByDay, paymentsByDay, expensesByDay, expensesByCategory] =
      await Promise.all([
        this.prisma.bill.aggregate({
          where: live,
          _count: true,
          _sum: {
            grossSubtotal: true,
            itemDiscount: true,
            billDiscount: true,
            packaging: true,
            cgst: true,
            sgst: true,
            roundOff: true,
            total: true,
          },
        }),
        this.prisma.bill.groupBy({
          by: ['businessDayId'],
          where: live,
          _count: true,
          _sum: { total: true },
        }),
        this.prisma.payment.groupBy({
          by: ['businessDayId', 'mode'],
          where: { businessDayId: { in: dayIds }, bill: { status: { not: 'VOID' } } },
          _sum: { amount: true },
        }),
        this.prisma.expense.groupBy({
          by: ['businessDayId'],
          where: { businessDayId: { in: dayIds }, voidedAt: null },
          _sum: { amount: true },
        }),
        this.prisma.expense.groupBy({
          by: ['categoryId'],
          where: { businessDayId: { in: dayIds }, voidedAt: null },
          _sum: { amount: true },
        }),
      ]);

    const gst = await this.gst(dayIds);
    const byType = await this.byType(dayIds);
    const orders = byType.DINE_IN.orders + byType.PARCEL.orders;
    const sums = billTotals._sum;
    const bills = billTotals._count;
    const total = sums.total ?? 0;

    const payments = noModes();
    const dayPayments = new Map<string, Modes>();
    for (const p of paymentsByDay) {
      const amount = p._sum.amount ?? 0;
      payments[p.mode] += amount;
      const modes = dayPayments.get(p.businessDayId) ?? noModes();
      modes[p.mode] += amount;
      dayPayments.set(p.businessDayId, modes);
    }

    const collected = payments.CASH + payments.UPI + payments.CARD;

    const categoryNames = await this.prisma.expenseCategory.findMany({
      where: { id: { in: expensesByCategory.map((e) => e.categoryId) } },
      select: { id: true, name: true },
    });
    const expenseRows = expensesByCategory
      .map((e) => ({
        name: categoryNames.find((c) => c.id === e.categoryId)?.name ?? 'Other',
        amount: e._sum.amount ?? 0,
      }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    const expenseTotal = expenseRows.reduce((n, e) => n + e.amount, 0);

    return {
      range: { from: range.from, to: range.to },
      days: perDate(
        days.map((d) => {
          const modes = dayPayments.get(d.id) ?? noModes();
          const billRow = billsByDay.find((b) => b.businessDayId === d.id);
          const dayTotal = billRow?._sum.total ?? 0;
          const collected = modes.CASH + modes.UPI + modes.CARD;
          return {
            dayId: d.id,
            date: d.date,
            status: d.status,
            bills: billRow?._count ?? 0,
            total: dayTotal,
            // Sales are billed; collected is what has been paid on those bills.
            collected,
            unpaid: dayTotal - collected,
            cash: modes.CASH,
            upi: modes.UPI,
            card: modes.CARD,
            expenses: expensesByDay.find((e) => e.businessDayId === d.id)?._sum.amount ?? 0,
          };
        }),
      ),
      summary: {
        bills,
        grossSubtotal: sums.grossSubtotal ?? 0,
        discounts: (sums.itemDiscount ?? 0) + (sums.billDiscount ?? 0),
        packaging: sums.packaging ?? 0,
        // Sales that carry GST; No-GST sales are `exempt`.
        taxable: gst.taxable,
        exempt: gst.exempt,
        gstBreakup: gst.rates,
        cgst: sums.cgst ?? 0,
        sgst: sums.sgst ?? 0,
        roundOff: sums.roundOff ?? 0,
        total,
        collected,
        unpaid: total - collected,
        // Per order, not per bill: a table split into several bills is still one ticket.
        averageOrder: orders > 0 ? Math.round(total / orders) : 0,
        payments,
        byType,
        expenses: { total: expenseTotal, byCategory: expenseRows },
        // What is left of sales once the GST collected and the expenses are taken off.
        net: total - (sums.cgst ?? 0) - (sums.sgst ?? 0) - expenseTotal,
      },
      items: await this.items(dayIds),
      categories: await this.categories(dayIds),
      hours: await this.hours(dayIds),
    };
  }

  /** Taxable value and GST per rate, from the bill lines (so bills made before the split read the same). */
  private async gst(dayIds: string[]) {
    if (dayIds.length === 0) return gstSummary([]);
    const rows = await this.prisma.$queryRaw<
      { cgstBp: number; sgstBp: number; taxable: number; cgst: number; sgst: number }[]
    >`
      SELECT CASE WHEN b.tax_scheme = 'REGULAR' THEN bi.cgst_bp ELSE 0 END AS "cgstBp",
             CASE WHEN b.tax_scheme = 'REGULAR' THEN bi.sgst_bp ELSE 0 END AS "sgstBp",
             SUM(bi.taxable)::float8 AS taxable, SUM(bi.cgst)::float8 AS cgst,
             SUM(bi.sgst)::float8 AS sgst
        FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
       WHERE b.business_day_id IN (${this.ids(dayIds)}) AND b.status <> 'VOID'
       GROUP BY 1, 2`;
    return gstSummary(rows);
  }

  private async byType(dayIds: string[]) {
    const result: Record<OrderType, { orders: number; total: number }> = {
      DINE_IN: { orders: 0, total: 0 },
      PARCEL: { orders: 0, total: 0 },
    };
    if (dayIds.length === 0) return result;
    const rows = await this.prisma.$queryRaw<{ type: OrderType; orders: number; total: number }[]>`
      SELECT o.type, COUNT(DISTINCT b.order_id)::int AS orders, COALESCE(SUM(b.total), 0)::float8 AS total
        FROM bills b JOIN orders o ON o.id = b.order_id
       WHERE b.business_day_id IN (${this.ids(dayIds)}) AND b.status <> 'VOID'
       GROUP BY o.type`;
    for (const row of rows) result[row.type] = { orders: row.orders, total: row.total };
    return result;
  }

  // Sums are float8: exact for whole paise up to 2^53, where int would overflow at ₹2.15 crore.

  /** Bills by the India hour they were made, for the busiest-hours chart. */
  private async hours(dayIds: string[]) {
    if (dayIds.length === 0) return [];
    return this.prisma.$queryRaw<{ hour: number; bills: number; total: number }[]>`
      SELECT EXTRACT(HOUR FROM b.created_at AT TIME ZONE ${TIME_ZONE})::int AS hour,
             COUNT(*)::int AS bills, COALESCE(SUM(b.total), 0)::float8 AS total
        FROM bills b
       WHERE b.business_day_id IN (${this.ids(dayIds)}) AND b.status <> 'VOID'
       GROUP BY 1
       ORDER BY 1`;
  }

  /**
   * Every dish sold, by amount (after item discounts, before the bill discount). One row per
   * dish and portion, under its name today; an archived one keeps the name on its latest bill.
   */
  private async items(dayIds: string[]) {
    if (dayIds.length === 0) return [];
    return this.prisma.$queryRaw<
      { itemName: string; variantName: string; quantity: number; amount: number }[]
    >`
      SELECT COALESCE(CASE WHEN i.archived_at IS NULL THEN i.name END,
                      (array_agg(bi.item_name ORDER BY b.created_at DESC, bi.id))[1]) AS "itemName",
             COALESCE(CASE WHEN v.archived_at IS NULL THEN v.name END,
                      (array_agg(bi.variant_name ORDER BY b.created_at DESC, bi.id))[1]) AS "variantName",
             SUM(bi.quantity)::float8 AS quantity, SUM(bi.line_total)::float8 AS amount
        FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
        JOIN order_items oi ON oi.id = bi.order_item_id
        LEFT JOIN items i ON i.id = oi.item_id
        LEFT JOIN item_variants v ON v.id = oi.variant_id
       WHERE b.business_day_id IN (${this.ids(dayIds)}) AND b.status <> 'VOID'
       GROUP BY oi.item_id, oi.variant_id, i.name, i.archived_at, v.name, v.archived_at
       ORDER BY amount DESC, quantity DESC, "itemName"`;
  }

  /** Sales by the menu category the dish is in today ("Other" if it is gone). */
  private async categories(dayIds: string[]) {
    if (dayIds.length === 0) return [];
    return this.prisma.$queryRaw<{ name: string; quantity: number; amount: number }[]>`
      SELECT COALESCE(c.name, 'Other') AS name,
             SUM(bi.quantity)::float8 AS quantity, SUM(bi.line_total)::float8 AS amount
        FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
        JOIN order_items oi ON oi.id = bi.order_item_id
        LEFT JOIN items i ON i.id = oi.item_id
        LEFT JOIN categories c ON c.id = i.category_id
       WHERE b.business_day_id IN (${this.ids(dayIds)}) AND b.status <> 'VOID'
       GROUP BY COALESCE(c.name, 'Other')
       ORDER BY amount DESC, name`;
  }

  private ids(dayIds: string[]) {
    return Prisma.join(dayIds.map((id) => Prisma.sql`${id}::uuid`));
  }
}
