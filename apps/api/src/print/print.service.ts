import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { notFound } from '../common/master-data';
import type { AuthDevice } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

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

  async done(device: AuthDevice, jobId: string, ok: boolean) {
    const job = await this.prisma.printJob.findFirst({ where: { id: jobId, deviceId: device.id } });
    if (!job) throw notFound('Print job');
    if (job.status === 'PRINTED') {
      throw new ApiError(HttpStatus.CONFLICT, 'ALREADY_PRINTED', 'This job was already printed.');
    }
    const updated = await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        attempts: { increment: 1 },
        ...(ok ? { status: 'PRINTED', printedAt: new Date() } : {}),
      },
    });
    return { id: updated.id, status: updated.status, attempts: updated.attempts };
  }
}
