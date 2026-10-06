import { HttpStatus, Injectable } from '@nestjs/common';
import type { Order } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { invalidReference } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { OrdersService, orderNotOpen, tableHolder } from './orders.service';
import type { OrderView } from './orders.views';

const notDineIn = () =>
  new ApiError(HttpStatus.CONFLICT, 'NOT_DINE_IN', 'Only dine-in orders sit at a table.');

/** Moving a running order to another table and merging two tables into one order (spec §5.4). */
@Injectable()
export class TableMovesService {
  constructor(private readonly orders: OrdersService) {}

  async move(
    actor: AuthUser,
    orderId: string,
    ifMatch: string | undefined,
    tableId: string,
  ): Promise<OrderView> {
    let from: Order | null = null;
    const view = await this.orders.mutate(actor, orderId, ifMatch, async ({ tx, order }) => {
      if (order.type !== 'DINE_IN') throw notDineIn();
      if (order.status !== 'OPEN' && order.status !== 'BILLED') throw orderNotOpen();
      if (order.tableId === tableId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'VALIDATION',
          'The order is already at that table.',
        );
      }
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM tables
         WHERE id = ${tableId}::uuid AND outlet_id = ${actor.outletId}::uuid AND archived_at IS NULL
         FOR UPDATE`;
      if (locked.length === 0) throw invalidReference('tableId');
      const holder = await tableHolder(tx, tableId, orderId);
      if (holder) {
        throw new ApiError(HttpStatus.CONFLICT, 'TABLE_BUSY', 'That table already has an order.', {
          orderId: holder.id,
        });
      }
      from = order;
      await tx.order.update({ where: { id: orderId }, data: { tableId } });
    });
    // The old table frees up: tell screens watching it too.
    if (from) this.orders.changed(from);
    return view;
  }

  /** Moves every dish and KOT of `fromOrderId` onto `intoOrderId`; the emptied order is cancelled. */
  async merge(
    actor: AuthUser,
    intoOrderId: string,
    ifMatch: string | undefined,
    fromOrderId: string,
  ): Promise<OrderView> {
    if (intoOrderId === fromOrderId) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Choose another table to merge.');
    }
    let merged: Order | null = null;
    const view = await this.orders.mutate(actor, intoOrderId, ifMatch, async ({ tx, order }) => {
      const from = await this.orders.lockAnother(tx, actor.outletId, fromOrderId);
      const bills = await tx.bill.count({
        where: { orderId: fromOrderId, status: { not: 'VOID' } },
      });
      if (bills > 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'HAS_BILLS',
          'That table already has a bill. Void it before merging.',
        );
      }
      for (const o of [order, from]) {
        if (o.type !== 'DINE_IN') throw notDineIn();
        if (o.status !== 'OPEN') throw orderNotOpen();
      }
      if (order.businessDayId !== from.businessDayId) throw orderNotOpen();
      await tx.orderItem.updateMany({
        where: { orderId: fromOrderId },
        data: { orderId: intoOrderId },
      });
      await tx.kot.updateMany({ where: { orderId: fromOrderId }, data: { orderId: intoOrderId } });
      const into = await tx.order.findUniqueOrThrow({
        where: { id: intoOrderId },
        include: { table: true },
      });
      await tx.order.update({
        where: { id: intoOrderId },
        data: { guests: (order.guests ?? 0) + (from.guests ?? 0) },
      });
      await tx.order.update({
        where: { id: fromOrderId },
        data: {
          status: 'CANCELLED',
          cancelReason: `Merged into ${into.table?.name ?? 'another table'}`,
          cancelledById: actor.id,
          mergedIntoId: intoOrderId,
          closedAt: new Date(),
        },
      });
      merged = from;
    });
    if (merged) this.orders.changed(merged);
    return view;
  }
}
