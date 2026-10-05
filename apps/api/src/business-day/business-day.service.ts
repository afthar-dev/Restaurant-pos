import { HttpStatus, Injectable } from '@nestjs/common';
import type { BusinessDay, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

type DayWithOpener = BusinessDay & { openedBy: { id: string; name: string } };

const dayView = (day: DayWithOpener) => ({
  id: day.id,
  status: day.status,
  openingCash: day.openingCash,
  openedAt: day.openedAt,
  openedBy: { id: day.openedBy.id, name: day.openedBy.name },
});

export const dayNotOpen = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'DAY_NOT_OPEN',
    'The business day is not open. A manager needs to open it first.',
  );

@Injectable()
export class BusinessDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async current(outletId: string) {
    const day = await this.prisma.businessDay.findFirst({
      where: { outletId, status: 'OPEN' },
      include: { openedBy: { select: { id: true, name: true } } },
    });
    return { day: day ? dayView(day) : null };
  }

  async open(actor: AuthUser, openingCash: number) {
    const day = await this.prisma.$transaction(async (tx) => {
      // Serialise opens per outlet so two managers cannot open two days.
      await tx.$queryRaw`SELECT id FROM outlets WHERE id = ${actor.outletId}::uuid FOR UPDATE`;
      const existing = await tx.businessDay.findFirst({
        where: { outletId: actor.outletId, status: 'OPEN' },
      });
      if (existing) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'DAY_ALREADY_OPEN',
          'A business day is already open.',
        );
      }
      const created = await tx.businessDay.create({
        data: { outletId: actor.outletId, openingCash, openedById: actor.id },
        include: { openedBy: { select: { id: true, name: true } } },
      });
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: 'day.open',
          entity: 'business_day',
          entityId: created.id,
          after: { openingCash },
        },
        tx,
      );
      return created;
    });
    this.events.emit('day.updated', { outletId: actor.outletId });
    return dayView(day);
  }

  /** The open day, read inside a transaction; throws DAY_NOT_OPEN when there is none. */
  async requireOpen(tx: Prisma.TransactionClient, outletId: string): Promise<BusinessDay> {
    const day = await tx.businessDay.findFirst({ where: { outletId, status: 'OPEN' } });
    if (!day) throw dayNotOpen();
    return day;
  }
}
