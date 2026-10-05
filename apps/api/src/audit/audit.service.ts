import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditRecord {
  outletId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  reason?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

type Db = Pick<PrismaService, 'auditEntry'> | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `db` to write inside an existing transaction. */
  async record(entry: AuditRecord, db: Db = this.prisma): Promise<void> {
    await db.auditEntry.create({ data: entry });
  }

  async list(outletId: string, options: { limit: number; before?: Date }) {
    const entries = await this.prisma.auditEntry.findMany({
      where: { outletId, ...(options.before ? { createdAt: { lt: options.before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
      include: { actor: { select: { id: true, name: true } } },
    });
    return entries.map((e) => ({
      id: e.id,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      reason: e.reason,
      before: e.before,
      after: e.after,
      actor: e.actor,
      createdAt: e.createdAt,
    }));
  }
}
