import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { StockAdjustRequest, StockCountRequest, StockItemRequest } from '@rpos/shared';
import { nameTaken, notFound, sameActiveName } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { postTxn } from './post-txn';
import { rateOf, stockItemView, type LastPurchase } from './stock.views';

/** Stock items, manual adjustments and physical counts (spec §1.2 #9, §4.4.5). */
@Injectable()
export class StockItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Active items, the ones at or below their minimum first. */
  async list(outletId: string) {
    const rows = await this.prisma.stockItem.findMany({
      where: { outletId, archivedAt: null },
      orderBy: { name: 'asc' },
    });
    const last = await this.lastPurchases(rows.map((r) => r.id));
    return rows
      .map((r) => stockItemView(r, last.get(r.id) ?? null))
      .sort((a, b) => Number(b.low) - Number(a.low));
  }

  async create(actor: AuthUser, request: StockItemRequest) {
    await this.assertNameFree(actor.outletId, request.name);
    const item = await this.saveUnique(() =>
      this.prisma.stockItem.create({ data: { outletId: actor.outletId, ...request } }),
    );
    this.changed(actor.outletId);
    return stockItemView(item);
  }

  async update(actor: AuthUser, id: string, request: StockItemRequest) {
    await this.find(actor.outletId, id);
    await this.assertNameFree(actor.outletId, request.name, id);
    const item = await this.saveUnique(() =>
      this.prisma.stockItem.update({ where: { id }, data: request }),
    );
    this.changed(actor.outletId);
    return stockItemView(item);
  }

  async archive(actor: AuthUser, id: string) {
    await this.find(actor.outletId, id);
    const item = await this.prisma.stockItem.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    this.changed(actor.outletId);
    return stockItemView(item);
  }

  /** Wastage, staff meals, a correction: a signed change with a reason. */
  async adjust(actor: AuthUser, id: string, request: StockAdjustRequest) {
    await this.find(actor.outletId, id);
    await this.prisma.$transaction((tx) =>
      postTxn(tx, {
        outletId: actor.outletId,
        stockItemId: id,
        type: 'ADJUST',
        qtyMilli: request.qtyMilli,
        note: request.reason,
        createdById: actor.id,
      }),
    );
    this.changed(actor.outletId);
    return stockItemView(await this.find(actor.outletId, id));
  }

  /**
   * A physical count posts the difference from the books, so the variance stays visible.
   * The item row is locked while the difference is worked out and written.
   */
  async count(actor: AuthUser, id: string, request: StockCountRequest) {
    await this.find(actor.outletId, id);
    const difference = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ current_milli: number }[]>`
        SELECT current_milli FROM stock_items WHERE id = ${id}::uuid FOR UPDATE`;
      const diff = request.countedMilli - row!.current_milli;
      if (diff !== 0) {
        await postTxn(tx, {
          outletId: actor.outletId,
          stockItemId: id,
          type: 'COUNT',
          qtyMilli: diff,
          note: request.note || null,
          createdById: actor.id,
        });
      }
      return diff;
    });
    if (difference !== 0) this.changed(actor.outletId);
    return { difference, item: stockItemView(await this.find(actor.outletId, id)) };
  }

  async txns(outletId: string, id: string, limit: number) {
    await this.find(outletId, id, true);
    const rows = await this.prisma.stockTxn.findMany({
      where: { stockItemId: id },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((t) => ({
      id: t.id,
      type: t.type,
      qtyMilli: t.qtyMilli,
      amount: t.amount,
      purchaseId: t.purchaseId,
      note: t.note,
      createdAt: t.createdAt,
      createdBy: t.createdBy,
    }));
  }

  private async lastPurchases(itemIds: string[]): Promise<Map<string, LastPurchase>> {
    if (itemIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { stock_item_id: string; created_at: Date; qty_milli: number; amount: number }[]
    >`
      SELECT DISTINCT ON (stock_item_id) stock_item_id, created_at, qty_milli, amount
        FROM stock_txns
       WHERE type = 'PURCHASE' AND stock_item_id IN (${Prisma.join(itemIds.map((id) => Prisma.sql`${id}::uuid`))})
         AND NOT EXISTS (
           SELECT 1 FROM purchases p WHERE p.id = stock_txns.purchase_id AND p.voided_at IS NOT NULL)
       ORDER BY stock_item_id, created_at DESC`;
    return new Map(
      rows.map((r) => [
        r.stock_item_id,
        { date: r.created_at, rate: rateOf(r.amount, r.qty_milli) },
      ]),
    );
  }

  private async find(outletId: string, id: string, includeArchived = false) {
    const item = await this.prisma.stockItem.findFirst({
      where: { id, outletId, ...(includeArchived ? {} : { archivedAt: null }) },
    });
    if (!item) throw notFound('Stock item');
    return item;
  }

  private async assertNameFree(outletId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.stockItem.findFirst({
      where: { outletId, ...sameActiveName(name, exceptId) },
    });
    if (clash) throw nameTaken();
  }

  /** Two saves of the same name at once: the unique index refuses the second. */
  private async saveUnique<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw nameTaken();
      }
      throw error;
    }
  }

  private changed(outletId: string) {
    this.events.emit('stock.updated', { outletId });
  }
}
