import { Injectable } from '@nestjs/common';
import type { Printer, Station } from '@prisma/client';
import type { PrinterRequest, StationRequest } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import {
  archivedFilter,
  inUse,
  invalidReference,
  nameTaken,
  notFound,
  sameActiveName,
} from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const stationView = (s: Station) => ({ id: s.id, name: s.name, archivedAt: s.archivedAt });

type PrinterWithStation = Printer & {
  station: Station | null;
  device: { id: string; name: string } | null;
};
const PRINTER_INCLUDE = { station: true, device: { select: { id: true, name: true } } } as const;
const printerView = (p: PrinterWithStation) => ({
  id: p.id,
  name: p.name,
  purpose: p.purpose,
  station: p.station ? { id: p.station.id, name: p.station.name } : null,
  mode: p.mode,
  paperWidthMm: p.paperWidthMm,
  address: p.address,
  device: p.device,
  archivedAt: p.archivedAt,
});

/** Kitchen stations (where KOTs go) and the printers attached to them or to the counter. */
@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listStations(outletId: string, include?: string) {
    const stations = await this.prisma.station.findMany({
      where: { outletId, ...archivedFilter(include) },
      orderBy: { name: 'asc' },
    });
    return stations.map(stationView);
  }

  async createStation(actor: AuthUser, request: StationRequest) {
    await this.assertStationNameFree(actor.outletId, request.name);
    const station = await this.prisma.station.create({
      data: { outletId: actor.outletId, name: request.name },
    });
    await this.record(
      actor,
      'station.create',
      'station',
      station.id,
      undefined,
      stationView(station),
    );
    return stationView(station);
  }

  async updateStation(actor: AuthUser, id: string, request: StationRequest) {
    const current = await this.findStation(actor.outletId, id);
    await this.assertStationNameFree(actor.outletId, request.name, id);
    const station = await this.prisma.station.update({
      where: { id },
      data: { name: request.name },
    });
    await this.record(
      actor,
      'station.update',
      'station',
      id,
      stationView(current),
      stationView(station),
    );
    return stationView(station);
  }

  async archiveStation(actor: AuthUser, id: string) {
    const current = await this.findStation(actor.outletId, id);
    const [categories, printers] = await Promise.all([
      this.prisma.category.count({ where: { stationId: id, archivedAt: null } }),
      this.prisma.printer.count({ where: { stationId: id, archivedAt: null } }),
    ]);
    if (categories > 0 || printers > 0) {
      throw inUse('Menu categories or printers still send to this station. Move them first.');
    }
    const station = await this.prisma.station.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(actor, 'station.archive', 'station', id, stationView(current), undefined);
    return stationView(station);
  }

  async listPrinters(outletId: string, include?: string) {
    const printers = await this.prisma.printer.findMany({
      where: { outletId, ...archivedFilter(include) },
      include: PRINTER_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return printers.map(printerView);
  }

  async createPrinter(actor: AuthUser, request: PrinterRequest) {
    await this.assertPrinterNameFree(actor.outletId, request.name);
    const data = await this.printerData(actor.outletId, request);
    const printer = await this.prisma.printer.create({
      data: { outletId: actor.outletId, ...data },
      include: PRINTER_INCLUDE,
    });
    await this.record(
      actor,
      'printer.create',
      'printer',
      printer.id,
      undefined,
      printerView(printer),
    );
    return printerView(printer);
  }

  async updatePrinter(actor: AuthUser, id: string, request: PrinterRequest) {
    const current = await this.findPrinter(actor.outletId, id);
    await this.assertPrinterNameFree(actor.outletId, request.name, id);
    const data = await this.printerData(actor.outletId, request);
    const printer = await this.prisma.printer.update({
      where: { id },
      data,
      include: PRINTER_INCLUDE,
    });
    await this.record(
      actor,
      'printer.update',
      'printer',
      id,
      printerView(current),
      printerView(printer),
    );
    return printerView(printer);
  }

  async archivePrinter(actor: AuthUser, id: string) {
    const current = await this.findPrinter(actor.outletId, id);
    const printer = await this.prisma.printer.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: PRINTER_INCLUDE,
    });
    await this.record(actor, 'printer.archive', 'printer', id, printerView(current), undefined);
    return printerView(printer);
  }

  private async printerData(outletId: string, request: PrinterRequest) {
    let stationId: string | null = null;
    if (request.purpose === 'KOT' && request.stationId) {
      const station = await this.prisma.station.findFirst({
        where: { id: request.stationId, outletId, archivedAt: null },
      });
      if (!station) throw invalidReference('stationId');
      stationId = station.id;
    }
    let deviceId: string | null = null;
    if (request.deviceId) {
      const device = await this.prisma.device.findFirst({
        where: { id: request.deviceId, outletId, revokedAt: null },
      });
      if (!device) throw invalidReference('deviceId');
      deviceId = device.id;
    }
    return {
      name: request.name,
      purpose: request.purpose,
      stationId,
      deviceId,
      mode: request.mode,
      paperWidthMm: request.paperWidthMm,
      address: request.mode === 'AGENT' ? (request.address ?? null) : null,
    };
  }

  private async findStation(outletId: string, id: string): Promise<Station> {
    const station = await this.prisma.station.findFirst({ where: { id, outletId } });
    if (!station) throw notFound('Station');
    return station;
  }

  private async findPrinter(outletId: string, id: string): Promise<PrinterWithStation> {
    const printer = await this.prisma.printer.findFirst({
      where: { id, outletId },
      include: PRINTER_INCLUDE,
    });
    if (!printer) throw notFound('Printer');
    return printer;
  }

  private async assertStationNameFree(outletId: string, name: string, exceptId?: string) {
    if (
      await this.prisma.station.findFirst({
        where: { outletId, ...sameActiveName(name, exceptId) },
      })
    ) {
      throw nameTaken();
    }
  }

  private async assertPrinterNameFree(outletId: string, name: string, exceptId?: string) {
    if (
      await this.prisma.printer.findFirst({
        where: { outletId, ...sameActiveName(name, exceptId) },
      })
    ) {
      throw nameTaken();
    }
  }

  private record(
    actor: AuthUser,
    action: string,
    entity: string,
    id: string,
    before?: object,
    after?: object,
  ) {
    return this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action,
      entity,
      entityId: id,
      before: before as never,
      after: after as never,
    });
  }
}
