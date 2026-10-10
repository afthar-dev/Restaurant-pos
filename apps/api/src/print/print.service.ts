import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { notFound } from '../common/master-data';
import type { AuthDevice } from '../common/request-context';
import { taxBreakupOf } from '../billing/bill.views';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_PRINT_ATTEMPTS = 3;
/** How long a claimed job is reserved for the device that claimed it. */
const LEASE_SECONDS = 60;
/** Wait before a failed print is offered again (paper out, printer off). */
const RETRY_BACKOFF_SECONDS = 20;
/** Jobs older than this are not auto-printed; staff reprint from the order instead. */
const STALE_AFTER_MINUTES = 30;

interface KotEvent {
  outletId: string;
  kotId: string;
}

/**
 * Print queue. A job targets the device that owns the printer: a browser on a counter PC or
 * kitchen screen prints it (window.print) and reports back; a print agent does the same in v2.
 * Jobs never block service: if nobody prints them they wait, and staff can reprint.
 */
@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly media: MediaService,
  ) {}

  @OnEvent('kot.created', { promisify: true })
  @OnEvent('kot.print', { promisify: true })
  async queueKot(event: KotEvent): Promise<void> {
    try {
      await this.createKotJobs(event);
    } catch (error) {
      // The KOT is already saved and on the kitchen screen; a print failure must not undo that.
      this.logger.error(`Could not queue print for KOT ${event.kotId}: ${String(error)}`);
    }
  }

  private async createKotJobs(event: KotEvent): Promise<void> {
    const kot = await this.prisma.kot.findUnique({
      where: { id: event.kotId },
      include: {
        lines: { orderBy: { createdAt: 'asc' } },
        createdBy: { select: { name: true } },
        order: {
          select: {
            id: true,
            tableId: true,
            type: true,
            tokenNo: true,
            guests: true,
            customerName: true,
            table: { select: { name: true } },
            waiter: { select: { name: true } },
          },
        },
      },
    });
    if (!kot) return;
    const printers = await this.prisma.printer.findMany({
      where: { outletId: kot.outletId, stationId: kot.stationId, purpose: 'KOT', archivedAt: null },
    });
    for (const printer of printers) {
      const payload: Prisma.InputJsonValue = {
        kind: 'KOT',
        kotNo: kot.kotNo,
        kotType: kot.type,
        stationName: kot.stationName,
        orderType: kot.order.type,
        tableName: kot.order.table?.name ?? null,
        tokenNo: kot.order.tokenNo,
        customerName: kot.order.customerName,
        waiterName: kot.order.waiter?.name ?? kot.createdBy.name,
        guests: kot.order.guests,
        createdAt: kot.createdAt.toISOString(),
        paperWidthMm: printer.paperWidthMm,
        lines: kot.lines.map((l) => ({
          quantity: l.quantity,
          itemName: l.itemName,
          variantName: l.variantName,
          addons: (l.addons as { name: string }[]).map((a) => a.name),
          note: l.note,
          combo: l.comboComponents as Prisma.InputJsonValue,
        })),
      };
      const job = await this.prisma.printJob.create({
        data: {
          outletId: kot.outletId,
          printerId: printer.id,
          deviceId: printer.deviceId,
          kotId: kot.id,
          kind: 'KOT',
          payload,
        },
      });
      if (printer.deviceId) {
        this.events.emit('print.job', {
          outletId: kot.outletId,
          deviceId: printer.deviceId,
          jobId: job.id,
        });
      }
    }
    // The order screen shows whether each KOT printed.
    if (printers.length > 0) this.orderChanged(kot.outletId, kot.order);
  }

  private orderChanged(outletId: string, order: { id: string; tableId: string | null }) {
    this.events.emit('order.updated', { outletId, orderId: order.id, tableId: order.tableId });
  }

  /** Queues the bill on every bill printer; returns how many jobs were queued (0: no printer). */
  async queueBillJobs(billId: string): Promise<number> {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) return 0;
    const printers = await this.prisma.printer.findMany({
      where: { outletId: bill.outletId, purpose: 'BILL', archivedAt: null },
    });
    for (const printer of printers) {
      const payload = await this.buildBillPayload(billId, printer.paperWidthMm);
      if (!payload) return 0;
      const job = await this.prisma.printJob.create({
        data: {
          outletId: bill.outletId,
          printerId: printer.id,
          deviceId: printer.deviceId,
          billId,
          kind: 'BILL',
          payload,
        },
      });
      if (printer.deviceId) {
        this.events.emit('print.job', {
          outletId: bill.outletId,
          deviceId: printer.deviceId,
          jobId: job.id,
        });
      }
    }
    return printers.length;
  }

  /** What a printed bill shows, for the print queue or for printing on the counter screen. */
  async buildBillPayload(billId: string, paperWidthMm: number) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
        createdBy: { select: { name: true } },
        outlet: { include: { logo: { select: { key: true } } } },
        order: {
          select: {
            type: true,
            tokenNo: true,
            guests: true,
            customerName: true,
            table: { select: { name: true } },
            waiter: { select: { name: true } },
          },
        },
      },
    });
    if (!bill) return null;
    const paid = bill.payments.reduce((sum, p) => sum + p.amount, 0);
    const percent = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;
    return {
      kind: 'BILL',
      title: bill.taxScheme === 'REGULAR' ? 'Tax Invoice' : 'Bill of Supply',
      outlet: {
        name: bill.outlet.name,
        address: bill.outlet.address,
        phone: bill.outlet.phone,
        gstin: bill.outlet.gstin,
        fssaiNumber: bill.outlet.fssaiNumber,
        billHeader: bill.outlet.billHeader,
        billFooter: bill.outlet.billFooter,
        logoUrl: bill.outlet.logo ? this.media.urlFor(bill.outlet.logo.key) : null,
      },
      billNo: bill.billNo,
      financialYear: bill.financialYear,
      status: bill.status,
      createdAt: bill.createdAt.toISOString(),
      cashierName: bill.createdBy.name,
      waiterName: bill.order.waiter?.name ?? null,
      orderType: bill.order.type,
      tableName: bill.order.table?.name ?? null,
      tokenNo: bill.order.tokenNo,
      customerName: bill.order.customerName,
      guests: bill.order.guests,
      paperWidthMm,
      lines: bill.items.map((i) => ({
        itemName: i.itemName,
        variantName: i.variantName,
        addons: (i.addons as { name: string }[]).map((a) => a.name),
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        amount: i.lineTotal,
      })),
      grossSubtotal: bill.grossSubtotal,
      itemDiscount: bill.itemDiscount,
      billDiscount: bill.billDiscount,
      discountReason: bill.discountReason,
      packaging: bill.packaging,
      taxable: bill.taxable,
      cgst: bill.cgst,
      sgst: bill.sgst,
      taxBreakup: taxBreakupOf(bill).map((row) => ({
        ratePercent: percent(row.cgstBp + row.sgstBp),
        cgstPercent: percent(row.cgstBp),
        sgstPercent: percent(row.sgstBp),
        taxable: row.taxable,
        cgst: row.cgst,
        sgst: row.sgst,
      })),
      roundOff: bill.roundOff,
      total: bill.total,
      payments: bill.payments.map((p) => ({ mode: p.mode, amount: p.amount })),
      paid,
      due: bill.status === 'VOID' ? 0 : Math.max(0, bill.total - paid),
    } satisfies Prisma.InputJsonValue;
  }

  async pending(device: AuthDevice) {
    const jobs = await this.prisma.printJob.findMany({
      where: { deviceId: device.id, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { printer: { select: { name: true, paperWidthMm: true } } },
    });
    return jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      printer: j.printer,
      payload: j.payload,
      attempts: j.attempts,
      createdAt: j.createdAt,
    }));
  }

  /**
   * Hands this device the jobs it should print now and leases them, so a second tab on the
   * same PC (or a retry after a lost acknowledgement) does not print the same ticket again.
   * Concurrent claims skip each other's rows. Jobs older than STALE_AFTER are left for a
   * manual reprint: a ticket for an order taken hours ago should not suddenly appear.
   */
  async claim(device: AuthDevice) {
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE print_jobs SET lease_until = now() + ${`${LEASE_SECONDS} seconds`}::interval,
        updated_at = now()
      WHERE id IN (
        SELECT id FROM print_jobs
        WHERE device_id = ${device.id}::uuid AND status = 'PENDING'
          AND (lease_until IS NULL OR lease_until < now())
          AND created_at > now() - ${`${STALE_AFTER_MINUTES} minutes`}::interval
        ORDER BY created_at
        LIMIT 20
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    if (claimed.length === 0) return [];
    const jobs = await this.prisma.printJob.findMany({
      where: { id: { in: claimed.map((c) => c.id) } },
      orderBy: { createdAt: 'asc' },
      include: { printer: { select: { name: true, paperWidthMm: true } } },
    });
    return jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      printer: j.printer,
      payload: j.payload,
      attempts: j.attempts,
      createdAt: j.createdAt,
    }));
  }

  /**
   * Records the outcome in one statement so concurrent reports cannot skip the attempt cap.
   * A failed print backs off before it can be claimed again; after MAX_PRINT_ATTEMPTS it
   * stops (staff can still reprint the KOT).
   */
  async done(device: AuthDevice, jobId: string, ok: boolean) {
    const [updated] = await this.prisma.$queryRaw<
      { id: string; status: string; attempts: number }[]
    >`
      UPDATE print_jobs SET
        attempts = attempts + 1,
        status = (CASE
          WHEN ${ok} THEN 'PRINTED'
          WHEN attempts + 1 >= ${MAX_PRINT_ATTEMPTS} THEN 'FAILED'
          ELSE 'PENDING' END)::"PrintJobStatus",
        printed_at = CASE WHEN ${ok} THEN now() ELSE printed_at END,
        lease_until = CASE WHEN ${ok} THEN NULL
          ELSE now() + ${`${RETRY_BACKOFF_SECONDS} seconds`}::interval END,
        updated_at = now()
      WHERE id = ${jobId}::uuid AND device_id = ${device.id}::uuid AND status = 'PENDING'
      RETURNING id, status::text AS status, attempts`;
    if (updated) {
      if (updated.status !== 'PENDING') {
        const kot = await this.prisma.printJob
          .findUnique({ where: { id: jobId } })
          .kot({ select: { order: { select: { id: true, tableId: true } } } });
        if (kot) this.orderChanged(device.outletId, kot.order);
      }
      return updated;
    }
    const job = await this.prisma.printJob.findFirst({ where: { id: jobId, deviceId: device.id } });
    if (!job) throw notFound('Print job');
    if (job.status === 'PRINTED') {
      throw new ApiError(HttpStatus.CONFLICT, 'ALREADY_PRINTED', 'This job was already printed.');
    }
    throw new ApiError(HttpStatus.CONFLICT, 'PRINT_FAILED', 'This job was given up on.');
  }
}
