import { Injectable } from '@nestjs/common';
import type { Area, DiningTable } from '@prisma/client';
import type { AreaRequest, TableRequest } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { randomToken } from '../common/crypto';
import {
  inUse,
  invalidReference,
  nameTaken,
  notFound,
  sameActiveName,
} from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** "T2" before "T10". */
const byNaturalName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' });

const areaView = (a: Area) => ({
  id: a.id,
  name: a.name,
  sortOrder: a.sortOrder,
  archivedAt: a.archivedAt,
});

const tableView = (t: DiningTable) => ({
  id: t.id,
  areaId: t.areaId,
  name: t.name,
  seats: t.seats,
  archivedAt: t.archivedAt,
});

/** Dining areas (AC hall, outdoor...) and their tables. */
@Injectable()
export class FloorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active areas with their active tables, for POS and captain screens. */
  async floor(outletId: string) {
    const areas = await this.prisma.area.findMany({
      where: { outletId, archivedAt: null },
      include: { tables: { where: { archivedAt: null } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return areas.map((a) => ({
      id: a.id,
      name: a.name,
      sortOrder: a.sortOrder,
      tables: [...a.tables]
        .sort(byNaturalName)
        .map((t) => ({ id: t.id, name: t.name, seats: t.seats })),
    }));
  }

  async createArea(actor: AuthUser, request: AreaRequest) {
    await this.assertAreaNameFree(actor.outletId, request.name);
    const area = await this.prisma.area.create({
      data: { outletId: actor.outletId, name: request.name, sortOrder: request.sortOrder ?? 0 },
    });
    await this.record(actor, 'area.create', 'area', area.id, undefined, areaView(area));
    return areaView(area);
  }

  async updateArea(actor: AuthUser, id: string, request: AreaRequest) {
    const current = await this.findArea(actor.outletId, id);
    await this.assertAreaNameFree(actor.outletId, request.name, id);
    const area = await this.prisma.area.update({
      where: { id },
      data: { name: request.name, sortOrder: request.sortOrder ?? current.sortOrder },
    });
    await this.record(actor, 'area.update', 'area', id, areaView(current), areaView(area));
    return areaView(area);
  }

  async archiveArea(actor: AuthUser, id: string) {
    const current = await this.findArea(actor.outletId, id);
    const tables = await this.prisma.diningTable.count({ where: { areaId: id, archivedAt: null } });
    if (tables > 0) throw inUse('This area still has tables. Move or archive them first.');
    const area = await this.prisma.area.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.record(actor, 'area.archive', 'area', id, areaView(current), undefined);
    return areaView(area);
  }

  /** Includes the QR token, for printing table QR codes. */
  async getTable(outletId: string, id: string) {
    const table = await this.findTable(outletId, id);
    return { ...tableView(table), qrToken: table.qrToken };
  }

  async createTable(actor: AuthUser, request: TableRequest) {
    await this.assertAreaActive(actor.outletId, request.areaId);
    await this.assertTableNameFree(actor.outletId, request.name);
    const table = await this.prisma.diningTable.create({
      data: {
        outletId: actor.outletId,
        areaId: request.areaId,
        name: request.name,
        seats: request.seats,
        qrToken: randomToken(),
      },
    });
    await this.record(actor, 'table.create', 'table', table.id, undefined, tableView(table));
    return tableView(table);
  }

  async updateTable(actor: AuthUser, id: string, request: TableRequest) {
    const current = await this.findTable(actor.outletId, id);
    await this.assertAreaActive(actor.outletId, request.areaId);
    await this.assertTableNameFree(actor.outletId, request.name, id);
    const table = await this.prisma.diningTable.update({
      where: { id },
      data: { areaId: request.areaId, name: request.name, seats: request.seats },
    });
    await this.record(actor, 'table.update', 'table', id, tableView(current), tableView(table));
    return tableView(table);
  }

  async archiveTable(actor: AuthUser, id: string) {
    const current = await this.findTable(actor.outletId, id);
    const table = await this.prisma.diningTable.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(actor, 'table.archive', 'table', id, tableView(current), undefined);
    return tableView(table);
  }

  private async findArea(outletId: string, id: string): Promise<Area> {
    const area = await this.prisma.area.findFirst({ where: { id, outletId } });
    if (!area) throw notFound('Area');
    return area;
  }

  private async findTable(outletId: string, id: string): Promise<DiningTable> {
    const table = await this.prisma.diningTable.findFirst({ where: { id, outletId } });
    if (!table) throw notFound('Table');
    return table;
  }

  private async assertAreaActive(outletId: string, areaId: string) {
    const area = await this.prisma.area.findFirst({
      where: { id: areaId, outletId, archivedAt: null },
    });
    if (!area) throw invalidReference('areaId');
  }

  private async assertAreaNameFree(outletId: string, name: string, exceptId?: string) {
    if (
      await this.prisma.area.findFirst({ where: { outletId, ...sameActiveName(name, exceptId) } })
    ) {
      throw nameTaken();
    }
  }

  private async assertTableNameFree(outletId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.diningTable.findFirst({
      where: { outletId, ...sameActiveName(name, exceptId) },
    });
    if (clash) throw nameTaken();
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
