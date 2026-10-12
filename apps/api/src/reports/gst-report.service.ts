import { Injectable } from '@nestjs/common';
import { RESTAURANT_SAC, type GstReport, type ReportRange } from '@rpos/shared';
import { financialYear } from '../billing/financial-year';
import { compositionFigures, gstLinesOf, gstSummary } from '../billing/gst-summary';
import { PrismaService } from '../prisma/prisma.service';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Start of an India calendar date (YYYY-MM-DD) as an instant. */
const istStart = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS);

/** The India date and time of a moment: 2027-03-31 and 23:59. */
function istParts(at: Date): { date: string; time: string } {
  const iso = new Date(at.getTime() + IST_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Paise as rupees with 2 decimals, for spreadsheets: 117050 -> "1170.50". */
const rupees = (paise: number) => (paise / 100).toFixed(2);

/**
 * One CSV cell. Text is always quoted with `"` doubled; text a spreadsheet would run as a
 * formula gets a leading `'`.
 */
function text(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const REGISTER_HEADER = [
  'Bill no',
  'Date',
  'Time',
  'Type',
  'Table',
  'Subtotal',
  'Discount',
  'Packaging',
  'Taxable',
  'CGST',
  'SGST',
  'Round off',
  'Total',
  'Paid by',
  'Status',
  'Customer GSTIN',
].join(',');

/**
 * GST figures and the bill register for an accountant. Bills are filed by invoice date (the
 * bill's creation moment in India time), not by business day. Read-only.
 */
@Injectable()
export class GstReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bills created on the India dates `from`..`to`, oldest first. */
  private bills(outletId: string, range: ReportRange) {
    return this.prisma.bill.findMany({
      where: {
        outletId,
        createdAt: {
          gte: istStart(range.from),
          lt: new Date(istStart(range.to).getTime() + DAY_MS),
        },
      },
      include: {
        items: {
          select: {
            cgstBp: true,
            sgstBp: true,
            taxable: true,
            cgst: true,
            sgst: true,
            quantity: true,
          },
        },
        payments: { select: { mode: true }, orderBy: { createdAt: 'asc' } },
        order: { select: { type: true, table: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { billNo: 'asc' }],
    });
  }

  async gst(outletId: string, range: ReportRange): Promise<GstReport> {
    const [{ taxScheme }, bills] = await Promise.all([
      this.prisma.outlet.findUniqueOrThrow({
        where: { id: outletId },
        select: { taxScheme: true },
      }),
      this.bills(outletId, range),
    ]);

    const live = bills.filter((b) => b.status !== 'VOID');
    // Each bill is judged by the scheme it was made under, not the outlet's scheme today.
    const regular = live.filter((b) => b.taxScheme !== 'COMPOSITION');
    const composed = live.filter((b) => b.taxScheme === 'COMPOSITION');
    const summary = gstSummary(regular.flatMap((b) => gstLinesOf(b)));

    let quantity = 0;
    let value = 0;
    for (const b of live) {
      for (const i of b.items) {
        quantity += i.quantity;
        value += i.taxable;
      }
    }

    const series = new Map<string, GstReport['series'][number]>();
    for (const b of bills) {
      const fy = financialYear(b.createdAt);
      const row = series.get(fy) ?? { fy, first: b.billNo, last: b.billNo, count: 0, voided: 0 };
      row.first = Math.min(row.first, b.billNo);
      row.last = Math.max(row.last, b.billNo);
      row.count += 1;
      if (b.status === 'VOID') row.voided += 1;
      series.set(fy, row);
    }

    const turnover = composed.reduce((n, b) => n + b.total, 0);
    return {
      range: { from: range.from, to: range.to },
      scheme: taxScheme,
      b2cByRate: summary.rates.map((r) => ({ ...r, total: r.taxable + r.cgst + r.sgst })),
      exempt: summary.exempt,
      sac: { code: RESTAURANT_SAC, quantity, value },
      series: [...series.values()].sort((a, b) => a.fy.localeCompare(b.fy)),
      composition:
        taxScheme === 'COMPOSITION' || composed.length > 0 ? compositionFigures(turnover) : null,
    };
  }

  /**
   * One row per bill (void bills keep their original totals, Status VOID), as CSV text with a
   * leading BOM so Excel reads rupee signs and Indian names as UTF-8.
   */
  async billRegister(outletId: string, range: ReportRange): Promise<string> {
    const bills = await this.bills(outletId, range);
    const rows = bills.map((b) => {
      const { date, time } = istParts(b.createdAt);
      const modes = [...new Set(b.payments.map((p) => p.mode))].join('+');
      return [
        b.billNo,
        date,
        time,
        b.order.type,
        text(b.order.table?.name ?? ''),
        rupees(b.grossSubtotal),
        rupees(b.itemDiscount + b.billDiscount),
        rupees(b.packaging),
        rupees(b.taxable),
        rupees(b.cgst),
        rupees(b.sgst),
        rupees(b.roundOff),
        rupees(b.total),
        text(modes),
        b.status,
        text(b.customerGstin ?? ''),
      ].join(',');
    });
    return `\uFEFF${[REGISTER_HEADER, ...rows].join('\r\n')}\r\n`;
  }
}
