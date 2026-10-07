import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { PurchaseRequest } from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { BusinessDayService } from '../business-day/business-day.service';
import { ApiError } from '../common/api-error';
import { notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { rawMaterialCategory } from '../expenses/expense-categories.service';
import { dayClosed, ExpensesService } from '../expenses/expenses.service';
import { PrismaService } from '../prisma/prisma.service';
import { postTxn } from './post-txn';
import { purchaseInclude, purchaseView } from './stock.views';

const keyFor = (key: string) => `purchase:${key}`;

const byItem = <T extends { stockItemId: string }>(lines: T[]) =>
  [...lines].sort((a, b) => a.stockItemId.localeCompare(b.stockItemId));

const itemUnknown = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'ITEM_UNKNOWN',
    'One of the items is no longer in the stock list. Refresh and try again.',
  );

/**
 * Goods bought from a vendor. Saving one adds the stock and books one "Raw material" expense
 * in the same transaction (spec §4.4.6), on the open business day.
 */
@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly days: BusinessDayService,
    private readonly expenses: ExpensesService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async create(actor: AuthUser, idempotencyKey: string | undefined, request: PurchaseRequest) {
    const replay = idempotencyKey && (await this.stored(actor.outletId, idempotencyKey));
    if (replay) return replay;
    const category = await rawMaterialCategory(this.prisma, actor.outletId);
    let purchaseId: string;
    try {
      purchaseId = await this.prisma.$transaction(async (tx) => {
        const day = await this.days.requireOpen(tx, actor.outletId);
        const ids = request.lines.map((l) => l.stockItemId);
        const known = await tx.stockItem.count({
          where: { id: { in: ids }, outletId: actor.outletId, archivedAt: null },
        });
        if (known !== ids.length) throw itemUnknown();
        const total = request.lines.reduce((sum, l) => sum + l.amount, 0);
        const purchase = await tx.purchase.create({
          data: {
            outletId: actor.outletId,
            businessDayId: day.id,
            vendorName: request.vendorName,
            billRef: request.billRef || null,
            paidMode: request.paidMode,
            total,
            note: request.note || null,
            createdById: actor.id,
            lines: { create: request.lines },
          },
        });
        // One order for every writer, so two purchases of the same items cannot deadlock.
        for (const line of byItem(request.lines)) {
          await postTxn(tx, {
            outletId: actor.outletId,
            stockItemId: line.stockItemId,
            type: 'PURCHASE',
            qtyMilli: line.qtyMilli,
            amount: line.amount,
            purchaseId: purchase.id,
            createdById: actor.id,
          });
        }
        await tx.expense.create({
          data: {
            outletId: actor.outletId,
            businessDayId: day.id,
            categoryId: category.id,
            amount: total,
            mode: request.paidMode,
            source: 'PURCHASE',
            purchaseId: purchase.id,
            note: `Purchase from ${request.vendorName}${request.billRef ? ` #${request.billRef}` : ''}`,
            createdById: actor.id,
          },
        });
        if (idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              outletId: actor.outletId,
              key: keyFor(idempotencyKey),
              response: { purchaseId: purchase.id },
            },
          });
        }
        return purchase.id;
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
    return this.get(actor.outletId, purchaseId);
  }

  /** `day` is "current", a business day id, or "all" (newest first, up to `limit`). */
  async list(outletId: string, day: string, limit: number) {
    let where: Prisma.PurchaseWhereInput = { outletId };
    if (day === 'current') {
      const open = await this.prisma.businessDay.findFirst({ where: { outletId, status: 'OPEN' } });
      if (!open) return [];
      where = { outletId, businessDayId: open.id };
    } else if (day !== 'all') {
      where = { outletId, businessDayId: day };
    }
    const rows = await this.prisma.purchase.findMany({
      where,
      include: purchaseInclude,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map(purchaseView);
  }

  async get(outletId: string, id: string) {
    const row = await this.prisma.purchase.findFirst({
      where: { id, outletId },
      include: purchaseInclude,
    });
    if (!row) throw notFound('Purchase');
    return purchaseView(row);
  }

  /** Takes the stock back out (it may go below zero) and voids the purchase's expense. */
  async void(actor: AuthUser, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, outletId: actor.outletId },
        include: { lines: true, expense: true },
      });
      if (!purchase) throw notFound('Purchase');
      const open = await this.days.requireOpen(tx, actor.outletId).catch(() => null);
      if (!open || open.id !== purchase.businessDayId) throw dayClosed();
      const updated = await tx.purchase.updateMany({
        where: { id, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: actor.id, voidReason: reason },
      });
      if (updated.count === 0) {
        throw new ApiError(HttpStatus.CONFLICT, 'ALREADY_VOIDED', 'This was already voided.');
      }
      for (const line of byItem(purchase.lines)) {
        await postTxn(tx, {
          outletId: actor.outletId,
          stockItemId: line.stockItemId,
          type: 'PURCHASE_VOID',
          qtyMilli: -line.qtyMilli,
          amount: -line.amount,
          purchaseId: purchase.id,
          note: reason,
          createdById: actor.id,
        });
      }
      if (purchase.expense && !purchase.expense.voidedAt) {
        await this.expenses.voidInTx(
          tx,
          actor,
          purchase.expense.id,
          purchase.businessDayId,
          reason,
        );
      }
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: 'purchase.void',
          entity: 'purchase',
          entityId: id,
          reason,
        },
        tx,
      );
    });
    this.changed(actor.outletId);
    return this.get(actor.outletId, id);
  }

  private changed(outletId: string) {
    this.events.emit('stock.updated', { outletId });
    this.events.emit('expense.updated', { outletId });
  }

  private async stored(outletId: string, key: string) {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { outletId_key: { outletId, key: keyFor(key) } },
    });
    const purchaseId = (row?.response as { purchaseId?: string } | null)?.purchaseId;
    return purchaseId ? this.get(outletId, purchaseId) : null;
  }
}
