import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CashMovementRequest, Permission } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { OverrideService } from '../auth/override.service';
import { BusinessDayService } from '../business-day/business-day.service';
import { notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { cashMovementInclude, cashMovementView } from './cash.views';

const ACTION = { PAY_IN: 'cash.pay_in', PAY_OUT: 'cash.pay_out', DROP: 'cash.drop' } as const;

/** Cash put into or taken out of the drawer during the business day (spec P5). */
@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly days: BusinessDayService,
    private readonly overrides: OverrideService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** A pay-out or a drop by someone without `day.openClose` needs a manager's token. */
  async add(actor: AuthUser, permissions: readonly Permission[], request: CashMovementRequest) {
    const created = await this.prisma.$transaction(async (tx) => {
      const day = await this.days.requireOpen(tx, actor.outletId);
      const approver =
        request.type === 'PAY_IN'
          ? null
          : await this.overrides.requireApproval(
              actor,
              permissions,
              'day.openClose',
              request.overrideToken,
              'A manager must approve this cash movement.',
            );
      const row = await tx.cashMovement.create({
        data: {
          outletId: actor.outletId,
          businessDayId: day.id,
          type: request.type,
          amount: request.amount,
          reasonCode: request.reasonCode,
          note: request.note || null,
          createdById: actor.id,
          approvedById: approver?.id ?? null,
        },
      });
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: ACTION[request.type],
          entity: 'cash_movement',
          entityId: row.id,
          reason: request.note || null,
          after: {
            amount: request.amount,
            reasonCode: request.reasonCode,
            ...(approver ? { approvedBy: approver.id } : {}),
          },
        },
        tx,
      );
      return row.id;
    });
    this.events.emit('day.updated', { outletId: actor.outletId });
    return this.get(actor.outletId, created);
  }

  /** The movements of a business day (the latest one when none is named), newest first. */
  async list(outletId: string, businessDayId: string | undefined) {
    const day = businessDayId
      ? await this.prisma.businessDay.findFirst({ where: { id: businessDayId, outletId } })
      : await this.prisma.businessDay.findFirst({
          where: { outletId },
          orderBy: { openedAt: 'desc' },
        });
    if (!day) {
      if (businessDayId) throw notFound('Business day');
      return [];
    }
    const rows = await this.prisma.cashMovement.findMany({
      where: { businessDayId: day.id },
      include: cashMovementInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(cashMovementView);
  }

  private async get(outletId: string, id: string) {
    const row = await this.prisma.cashMovement.findFirstOrThrow({
      where: { id, outletId },
      include: cashMovementInclude,
    });
    return cashMovementView(row);
  }
}
