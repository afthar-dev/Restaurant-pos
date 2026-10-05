import { Injectable } from '@nestjs/common';
import type { TaxRate } from '@prisma/client';
import type { TaxRateRequest } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { archivedFilter, inUse, nameTaken, notFound, sameActiveName } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

function toView(rate: TaxRate) {
  return {
    id: rate.id,
    name: rate.name,
    cgstBp: rate.cgstBp,
    sgstBp: rate.sgstBp,
    totalBp: rate.cgstBp + rate.sgstBp,
    archivedAt: rate.archivedAt,
  };
}

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(outletId: string, include?: string) {
    const rates = await this.prisma.taxRate.findMany({
      where: { outletId, ...archivedFilter(include) },
      orderBy: [{ cgstBp: 'asc' }, { name: 'asc' }],
    });
    return rates.map(toView);
  }

  async create(actor: AuthUser, request: TaxRateRequest) {
    await this.assertNameFree(actor.outletId, request.name);
    const rate = await this.prisma.taxRate.create({
      data: {
        outletId: actor.outletId,
        name: request.name,
        cgstBp: request.totalBp / 2,
        sgstBp: request.totalBp / 2,
      },
    });
    await this.record(actor, 'tax.create', rate.id, undefined, toView(rate));
    return toView(rate);
  }

  async update(actor: AuthUser, id: string, request: TaxRateRequest) {
    const current = await this.find(actor.outletId, id);
    await this.assertNameFree(actor.outletId, request.name, id);
    const rate = await this.prisma.taxRate.update({
      where: { id },
      data: { name: request.name, cgstBp: request.totalBp / 2, sgstBp: request.totalBp / 2 },
    });
    await this.record(actor, 'tax.update', id, toView(current), toView(rate));
    return toView(rate);
  }

  async archive(actor: AuthUser, id: string) {
    const current = await this.find(actor.outletId, id);
    const used = await this.prisma.item.count({ where: { taxRateId: id, archivedAt: null } });
    if (used > 0) throw inUse(`${used} menu item(s) use this tax rate. Move them first.`);
    const rate = await this.prisma.taxRate.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(actor, 'tax.archive', id, toView(current), undefined);
    return toView(rate);
  }

  private async find(outletId: string, id: string): Promise<TaxRate> {
    const rate = await this.prisma.taxRate.findFirst({ where: { id, outletId } });
    if (!rate) throw notFound('Tax rate');
    return rate;
  }

  private async assertNameFree(outletId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.taxRate.findFirst({
      where: { outletId, ...sameActiveName(name, exceptId) },
    });
    if (clash) throw nameTaken();
  }

  private record(actor: AuthUser, action: string, id: string, before?: object, after?: object) {
    return this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action,
      entity: 'tax_rate',
      entityId: id,
      before: before as never,
      after: after as never,
    });
  }
}
