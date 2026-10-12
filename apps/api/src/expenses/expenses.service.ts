import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { ExpenseRequest, Permission } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { OverrideService } from '../auth/override.service';
import { BusinessDayService } from '../business-day/business-day.service';
import { ApiError } from '../common/api-error';
import { invalidReference, notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { ensureDefaultCategories } from './expense-categories.service';
import { expenseTotals } from './expense-totals';
import { expenseInclude, expenseView } from './expense.views';

/** Idempotency keys share one table with payments and KOTs; expenses get their own prefix. */
const keyFor = (key: string) => `expense:${key}`;

export const dayClosed = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'DAY_CLOSED',
    'That business day is closed. The owner can reopen it to make corrections.',
  );

const alreadyVoided = () =>
  new ApiError(HttpStatus.CONFLICT, 'ALREADY_VOIDED', 'This was already voided.');

/** Money spent during the business day (spec §4.4.7, §5.5). */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly days: BusinessDayService,
    private readonly audit: AuditService,
    private readonly overrides: OverrideService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * A cash expense above the outlet's petty-cash limit needs a manager's token unless the
   * recorder can close the day.
   */
  async add(
    actor: AuthUser,
    permissions: readonly Permission[],
    idempotencyKey: string | undefined,
    request: ExpenseRequest,
  ) {
    const replay = idempotencyKey && (await this.stored(actor.outletId, idempotencyKey));
    if (replay) return replay;
    await ensureDefaultCategories(this.prisma, actor.outletId);
    let created: string;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const day = await this.days.requireOpen(tx, actor.outletId);
        const category = await tx.expenseCategory.findFirst({
          where: { id: request.categoryId, outletId: actor.outletId, archivedAt: null },
        });
        if (!category) throw invalidReference('categoryId');
        let approver: AuthUser | null = null;
        if (request.mode === 'CASH') {
          const outlet = await tx.outlet.findUniqueOrThrow({ where: { id: actor.outletId } });
          if (request.amount > outlet.pettyCashLimitPaise) {
            approver = await this.overrides.requireApproval(
              actor,
              permissions,
              'day.openClose',
              request.overrideToken,
              'A manager must approve a cash expense this large.',
            );
          }
        }
        const expense = await tx.expense.create({
          data: {
            outletId: actor.outletId,
            businessDayId: day.id,
            categoryId: category.id,
            amount: request.amount,
            mode: request.mode,
            note: request.note || null,
            createdById: actor.id,
          },
        });
        await this.audit.record(
          {
            outletId: actor.outletId,
            actorId: actor.id,
            action: 'expense.create',
            entity: 'expense',
            entityId: expense.id,
            reason: request.note || null,
            after: {
              amount: request.amount,
              mode: request.mode,
              categoryId: category.id,
              ...(approver ? { approvedBy: approver.id } : {}),
            },
          },
          tx,
        );
        if (idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              outletId: actor.outletId,
              key: keyFor(idempotencyKey),
              response: { expenseId: expense.id },
            },
          });
        }
        return expense.id;
      });
    } catch (error) {
      // The same key at the same moment: answer like a sequential retry.
      const duplicate =
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (!duplicate) throw error;
      const stored = await this.stored(actor.outletId, idempotencyKey);
      if (!stored) throw error;
      return stored;
    }
    this.changed(actor.outletId);
    return this.get(actor.outletId, created);
  }

  /** `day` is "current" (the open day, if any) or a business day id. */
  async list(outletId: string, day: string) {
    const businessDay =
      day === 'current'
        ? await this.prisma.businessDay.findFirst({ where: { outletId, status: 'OPEN' } })
        : await this.prisma.businessDay.findFirst({ where: { id: day, outletId } });
    if (!businessDay && day !== 'current') throw notFound('Business day');
    if (!businessDay) {
      return {
        day: null,
        expenses: [],
        totals: { total: 0, cash: 0, byMode: { CASH: 0, UPI: 0, CARD: 0 }, byCategory: [] },
      };
    }
    const rows = await this.prisma.expense.findMany({
      where: { businessDayId: businessDay.id },
      include: expenseInclude,
      orderBy: { createdAt: 'desc' },
    });
    return {
      day: { id: businessDay.id, status: businessDay.status, openedAt: businessDay.openedAt },
      expenses: rows.map(expenseView),
      totals: await expenseTotals(this.prisma, businessDay.id),
    };
  }

  async void(actor: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findFirst({ where: { id, outletId: actor.outletId } });
      if (!expense) throw notFound('Expense');
      if (expense.source === 'PURCHASE') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'VOID_THE_PURCHASE',
          'This expense came from a purchase. Void the purchase instead.',
        );
      }
      await this.voidInTx(tx, actor, expense.id, expense.businessDayId, reason);
    });
    this.changed(actor.outletId);
    return this.get(actor.outletId, id);
  }

  /**
   * Voids an expense inside the caller's transaction. Only while its day is the open day:
   * a closed day's cash tally must not change behind the report.
   */
  async voidInTx(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    expenseId: string,
    businessDayId: string,
    reason: string,
  ) {
    const open = await this.days.requireOpen(tx, actor.outletId).catch(() => null);
    if (!open || open.id !== businessDayId) throw dayClosed();
    const updated = await tx.expense.updateMany({
      where: { id: expenseId, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason },
    });
    if (updated.count === 0) throw alreadyVoided();
    await this.audit.record(
      {
        outletId: actor.outletId,
        actorId: actor.id,
        action: 'expense.void',
        entity: 'expense',
        entityId: expenseId,
        reason,
      },
      tx,
    );
  }

  async get(outletId: string, id: string) {
    const row = await this.prisma.expense.findFirst({
      where: { id, outletId },
      include: expenseInclude,
    });
    if (!row) throw notFound('Expense');
    return expenseView(row);
  }

  changed(outletId: string) {
    this.events.emit('expense.updated', { outletId });
  }

  private async stored(outletId: string, key: string) {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { outletId_key: { outletId, key: keyFor(key) } },
    });
    const expenseId = (row?.response as { expenseId?: string } | null)?.expenseId;
    return expenseId ? this.get(outletId, expenseId) : null;
  }
}
