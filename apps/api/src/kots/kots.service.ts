import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type Kot, type KotStatus, type OrderItem } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CountersService } from '../business-day/counters.service';
import { ApiError } from '../common/api-error';
import { notFound } from '../common/master-data';
import type { AuthDevice, AuthUser } from '../common/request-context';
import { billedQuantities, markBilledIfComplete } from '../billing/settle';
import { qrOrderEnded } from '../qr/end-sessions';
import { OrdersService } from '../orders/orders.service';
import type { OrderView } from '../orders/orders.views';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface KotSummary {
  id: string;
  kotNo: number;
  type: Kot['type'];
  status: KotStatus;
  stationId: string;
  stationName: string;
  createdAt: Date;
}

export interface SendKotResult {
  order: OrderView;
  kots: KotSummary[];
}

const summary = (k: Kot): KotSummary => ({
  id: k.id,
  kotNo: k.kotNo,
  type: k.type,
  status: k.status,
  stationId: k.stationId,
  stationName: k.stationName,
  createdAt: k.createdAt,
});

/** Kitchen order tickets: sending, cancelling, and their progress on the kitchen screen. */
@Injectable()
export class KotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly counters: CountersService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async send(
    actor: AuthUser,
    orderId: string,
    ifMatch: string | undefined,
    idempotencyKey: string | undefined,
  ): Promise<SendKotResult> {
    if (idempotencyKey) {
      // A retry must get the first answer even if it carries the version it saw before the
      // first send succeeded, so look the key up before the If-Match check.
      const replay = await this.replay(actor.outletId, orderId, idempotencyKey);
      if (replay) return replay;
    }
    let kots: Kot[] = [];
    let created = false;
    let order: OrderView;
    try {
      order = await this.orders.mutate(actor, orderId, ifMatch, async ({ tx, order: current }) => {
        if (idempotencyKey) {
          // Checked again under the order lock: a concurrent duplicate waits here for the first.
          const stored = await this.storedKotIds(tx, actor.outletId, orderId, idempotencyKey);
          if (stored) {
            kots = await tx.kot.findMany({
              where: { id: { in: stored } },
              orderBy: { kotNo: 'asc' },
            });
            return;
          }
        }
        if (current.status !== 'OPEN') {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'ORDER_NOT_OPEN',
            'This order is no longer open.',
          );
        }
        const items = await tx.orderItem.findMany({
          where: { orderId, status: 'NEW' },
          orderBy: { createdAt: 'asc' },
        });
        if (items.length === 0) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'NOTHING_TO_SEND',
            'There are no new items to send.',
          );
        }
        const byStation = new Map<string, OrderItem[]>();
        for (const item of items) {
          byStation.set(item.stationId, [...(byStation.get(item.stationId) ?? []), item]);
        }
        for (const [stationId, stationItems] of byStation) {
          const kot = await this.createKot(tx, actor, current, stationId, 'NEW', stationItems);
          await tx.orderItem.updateMany({
            where: { id: { in: stationItems.map((i) => i.id) } },
            data: { status: 'SENT', kotId: kot.id },
          });
          kots.push(kot);
        }
        created = true;
        if (idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              outletId: actor.outletId,
              key: idempotencyKey,
              response: { orderId, kotIds: kots.map((k) => k.id) },
            },
          });
        }
      });
    } catch (error) {
      // The same key used at the same moment on another order: report it like a sequential reuse.
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.replay(actor.outletId, orderId, idempotencyKey);
        if (replay) return replay;
      }
      throw error;
    }
    if (created) await this.announce(kots, orderId);
    return { order, kots: kots.map(summary) };
  }

  private async replay(
    outletId: string,
    orderId: string,
    key: string,
  ): Promise<SendKotResult | null> {
    const ids = await this.storedKotIds(this.prisma, outletId, orderId, key);
    if (!ids) return null;
    const kots = await this.prisma.kot.findMany({
      where: { id: { in: ids } },
      orderBy: { kotNo: 'asc' },
    });
    return { order: await this.orders.get(outletId, orderId), kots: kots.map(summary) };
  }

  /** KOT ids stored for this key, or null. A key used for another order is refused. */
  private async storedKotIds(
    db: Pick<Tx, 'idempotencyKey'>,
    outletId: string,
    orderId: string,
    key: string,
  ): Promise<string[] | null> {
    const stored = await db.idempotencyKey.findUnique({
      where: { outletId_key: { outletId, key } },
    });
    if (!stored) return null;
    const response = stored.response as { orderId?: string; kotIds: string[] };
    if (response.orderId !== orderId) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_KEY_REUSED',
        'This request id was already used for another order.',
      );
    }
    return response.kotIds;
  }

  /** Cancels all or part of an item already in the kitchen. `actor` is the approving manager. */
  async cancelItem(
    actor: AuthUser,
    requester: AuthUser,
    orderId: string,
    itemId: string,
    ifMatch: string | undefined,
    reason: string,
    quantity: number | undefined,
  ): Promise<OrderView> {
    let kot: Kot | null = null;
    let closed: Kot[] = [];
    const view = await this.orders.mutate(requester, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN') {
        throw new ApiError(HttpStatus.CONFLICT, 'ORDER_NOT_OPEN', 'This order is no longer open.');
      }
      const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId } });
      if (!item) throw notFound('Order item');
      if (item.status !== 'SENT') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'ITEM_NOT_SENT',
          item.status === 'NEW'
            ? 'This item has not been sent. Remove it instead.'
            : 'Already cancelled.',
        );
      }
      const qty = quantity ?? item.quantity;
      if (qty > item.quantity) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'VALIDATION',
          `Only ${item.quantity} can be cancelled.`,
        );
      }
      const billed = (await billedQuantities(tx, orderId)).get(item.id) ?? 0;
      if (qty > item.quantity - billed) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'ALREADY_BILLED',
          billed >= item.quantity
            ? 'This dish is already on a bill. Void the bill first.'
            : `Only ${item.quantity - billed} is not on a bill yet. Void the bill to cancel more.`,
        );
      }
      const cancelData = {
        status: 'CANCELLED' as const,
        cancelReason: reason,
        cancelledById: actor.id,
      };
      let cancelledLine: OrderItem;
      if (qty < item.quantity) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity - qty },
        });
        const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = item;
        cancelledLine = await tx.orderItem.create({
          data: {
            ...copy,
            addons: item.addons as Prisma.InputJsonValue,
            comboComponents: item.comboComponents as Prisma.InputJsonValue,
            quantity: qty,
            ...cancelData,
          },
        });
      } else {
        cancelledLine = await tx.orderItem.update({ where: { id: item.id }, data: cancelData });
      }
      kot = await this.createKot(tx, requester, order, item.stationId, 'CANCEL', [cancelledLine]);
      closed = await this.closeCancelledTickets(tx, orderId);
      // Same transaction: a cancellation without its audit entry must not exist.
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: 'order.item.cancel',
          entity: 'order',
          entityId: orderId,
          reason,
          after: {
            itemName: item.itemName,
            variantName: item.variantName,
            quantity: qty,
            requestedBy: requester.id,
          },
        },
        tx,
      );
      // Cancelling the last unbilled dishes may leave the order fully billed.
      await markBilledIfComplete(tx, orderId);
    });
    if (kot) await this.announce([kot], orderId);
    this.announceClosed(closed);
    return view;
  }

  /** Cancels an order whose items are already in the kitchen. `actor` is the approving manager. */
  async voidOrder(
    actor: AuthUser,
    requester: AuthUser,
    orderId: string,
    ifMatch: string | undefined,
    reason: string,
  ): Promise<OrderView> {
    const kots: Kot[] = [];
    let closed: Kot[] = [];
    const view = await this.orders.mutate(requester, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN') {
        throw new ApiError(HttpStatus.CONFLICT, 'ORDER_NOT_OPEN', 'This order is no longer open.');
      }
      const liveBills = await tx.bill.count({ where: { orderId, status: { not: 'VOID' } } });
      if (liveBills > 0) {
        throw new ApiError(HttpStatus.CONFLICT, 'HAS_BILLS', 'Void the bill first.');
      }
      const sent = await tx.orderItem.findMany({ where: { orderId, status: 'SENT' } });
      const byStation = new Map<string, OrderItem[]>();
      for (const item of sent) {
        byStation.set(item.stationId, [...(byStation.get(item.stationId) ?? []), item]);
      }
      for (const [stationId, items] of byStation) {
        kots.push(await this.createKot(tx, requester, order, stationId, 'CANCEL', items));
      }
      await tx.orderItem.updateMany({
        where: { orderId, status: { in: ['NEW', 'SENT'] } },
        data: { status: 'CANCELLED', cancelReason: reason, cancelledById: actor.id },
      });
      closed = await this.closeCancelledTickets(tx, orderId);
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelReason: reason,
          cancelledById: actor.id,
          closedAt: new Date(),
        },
      });
      await qrOrderEnded(tx, order);
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: 'order.void',
          entity: 'order',
          entityId: orderId,
          reason,
          after: { requestedBy: requester.id, cancelKots: kots.length },
        },
        tx,
      );
    });
    await this.announce(kots, orderId);
    this.announceClosed(closed);
    return view;
  }

  /**
   * The original ticket of a dish that was cancelled is no use to the kitchen: close every
   * ticket of the order whose dishes are all cancelled now (the separate cancel ticket tells
   * the cook). There is no cancelled ticket state, so they are closed like a served one.
   */
  private async closeCancelledTickets(tx: Tx, orderId: string): Promise<Kot[]> {
    const open = await tx.kot.findMany({
      where: { orderId, type: 'NEW', status: { in: ['NEW', 'PREPARING', 'READY'] } },
      include: { lines: { select: { orderItemId: true } } },
    });
    const items = await tx.orderItem.findMany({
      where: { id: { in: open.flatMap((k) => k.lines.map((l) => l.orderItemId)) } },
      select: { id: true, status: true },
    });
    const cancelled = new Set(items.filter((i) => i.status === 'CANCELLED').map((i) => i.id));
    const done = open.filter(
      (k) => k.lines.length > 0 && k.lines.every((l) => cancelled.has(l.orderItemId)),
    );
    for (const kot of done) {
      await tx.kot.update({
        where: { id: kot.id },
        data: { status: 'SERVED', servedAt: new Date() },
      });
    }
    return done;
  }

  private announceClosed(kots: Kot[]) {
    for (const kot of kots) {
      this.events.emit('kot.updated', {
        outletId: kot.outletId,
        kotId: kot.id,
        kotNo: kot.kotNo,
        orderId: kot.orderId,
        stationId: kot.stationId,
        tableName: null,
        tokenNo: null,
        status: 'SERVED',
      });
    }
  }

  /** Stations for the kitchen screen's filter, including ones with no tickets right now. */
  async kitchenStations(device: AuthDevice) {
    this.assertKitchenScreen(device);
    return this.prisma.station.findMany({
      where: { outletId: device.outletId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async kitchenTickets(device: AuthDevice, stationId?: string) {
    this.assertKitchenScreen(device);
    const kots = await this.prisma.kot.findMany({
      where: {
        outletId: device.outletId,
        businessDay: { status: 'OPEN' },
        ...(stationId ? { stationId } : {}),
        OR: [
          { type: 'NEW', status: { in: ['NEW', 'PREPARING', 'READY'] } },
          { type: 'CANCEL', status: 'NEW' },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        lines: { orderBy: { createdAt: 'asc' } },
        createdBy: { select: { name: true } },
        order: {
          select: {
            type: true,
            tokenNo: true,
            guests: true,
            table: { select: { name: true } },
            waiter: { select: { name: true } },
          },
        },
      },
    });
    return kots.map((k) => ({
      id: k.id,
      orderId: k.orderId,
      kotNo: k.kotNo,
      type: k.type,
      status: k.status,
      stationId: k.stationId,
      stationName: k.stationName,
      orderType: k.order.type,
      tableName: k.order.table?.name ?? null,
      tokenNo: k.order.tokenNo,
      guests: k.order.guests,
      waiterName: k.order.waiter?.name ?? k.createdBy.name,
      createdAt: k.createdAt,
      lines: k.lines.map((l) => ({
        id: l.id,
        itemName: l.itemName,
        variantName: l.variantName,
        quantity: l.quantity,
        addons: (l.addons as { name: string }[]).map((a) => a.name),
        comboComponents: l.comboComponents,
        note: l.note,
      })),
    }));
  }

  async kitchenUpdate(device: AuthDevice, kotId: string, status: KotStatus) {
    this.assertKitchenScreen(device);
    const kot = await this.prisma.kot.findFirst({
      where: { id: kotId, outletId: device.outletId },
    });
    if (!kot) throw notFound('KOT');
    const allowed: Record<string, KotStatus[]> =
      kot.type === 'CANCEL'
        ? { NEW: ['SERVED'] }
        : { NEW: ['PREPARING', 'READY'], PREPARING: ['READY'], READY: ['SERVED'] };
    return this.transition(kot, status, allowed);
  }

  async served(user: AuthUser, kotId: string) {
    const kot = await this.prisma.kot.findFirst({ where: { id: kotId, outletId: user.outletId } });
    if (!kot) throw notFound('KOT');
    // Cancellation tickets are acknowledged on the kitchen screen, not by floor staff.
    if (kot.type === 'CANCEL') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_TRANSITION',
        'The kitchen dismisses cancellation tickets.',
      );
    }
    return this.transition(kot, 'SERVED', {
      NEW: ['SERVED'],
      PREPARING: ['SERVED'],
      READY: ['SERVED'],
    });
  }

  async reprint(user: AuthUser, kotId: string) {
    const kot = await this.prisma.kot.findFirst({ where: { id: kotId, outletId: user.outletId } });
    if (!kot) throw notFound('KOT');
    await this.events.emitAsync('kot.print', { outletId: kot.outletId, kotId: kot.id });
    return { id: kot.id, queued: true };
  }

  private async transition(kot: Kot, status: KotStatus, allowed: Record<string, KotStatus[]>) {
    if (!allowed[kot.status]?.includes(status)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_TRANSITION',
        `A ${kot.status.toLowerCase()} ticket cannot become ${status.toLowerCase()}.`,
      );
    }
    // Conditional update: a second tap from another screen does not overwrite a newer state.
    const updated = await this.prisma.kot.updateMany({
      where: { id: kot.id, status: kot.status },
      data: {
        status,
        ...(status === 'READY' ? { readyAt: new Date() } : {}),
        ...(status === 'SERVED' ? { servedAt: new Date() } : {}),
      },
    });
    if (updated.count === 0) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_TRANSITION',
        'This ticket was just updated elsewhere.',
      );
    }
    // Table or token travel with the notice so "ready" alerts can name the order on any screen.
    const order = await this.prisma.order.findUnique({
      where: { id: kot.orderId },
      select: { tokenNo: true, table: { select: { name: true } } },
    });
    this.events.emit('kot.updated', {
      outletId: kot.outletId,
      kotId: kot.id,
      kotNo: kot.kotNo,
      orderId: kot.orderId,
      stationId: kot.stationId,
      tableName: order?.table?.name ?? null,
      tokenNo: order?.tokenNo ?? null,
      status,
    });
    return { id: kot.id, status };
  }

  private assertKitchenScreen(device: AuthDevice) {
    if (device.type !== 'KDS') {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        'DEVICE_NOT_ALLOWED',
        'Only a device registered as a kitchen screen can do this.',
      );
    }
  }

  private async createKot(
    tx: Tx,
    actor: AuthUser,
    order: { id: string; outletId: string; businessDayId: string },
    stationId: string,
    type: 'NEW' | 'CANCEL',
    items: OrderItem[],
  ): Promise<Kot> {
    const station = await tx.station.findUnique({ where: { id: stationId } });
    const kotNo = await this.counters.next(tx, order.outletId, 'KOT', order.businessDayId);
    const base = Date.now();
    return tx.kot.create({
      data: {
        outletId: order.outletId,
        businessDayId: order.businessDayId,
        orderId: order.id,
        kotNo,
        type,
        stationId,
        stationName: station?.name ?? 'Kitchen',
        createdById: actor.id,
        lines: {
          create: items.map((i, index) => ({
            orderItemId: i.id,
            itemName: i.itemName,
            variantName: i.variantName,
            quantity: i.quantity,
            addons: i.addons as Prisma.InputJsonValue,
            comboComponents: i.comboComponents as Prisma.InputJsonValue,
            note: i.note,
            createdAt: new Date(base + index),
          })),
        },
      },
    });
  }

  private async announce(kots: Kot[], orderId: string) {
    for (const kot of kots) {
      await this.events.emitAsync('kot.created', {
        outletId: kot.outletId,
        kotId: kot.id,
        orderId,
        stationId: kot.stationId,
      });
    }
  }
}
