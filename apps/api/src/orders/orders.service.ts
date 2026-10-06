import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Order, OrderSource, Prisma } from '@prisma/client';
import type {
  AddItemsRequest,
  CreateOrderRequest,
  OrderLineRequest,
  UpdateOrderItemRequest,
} from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { BusinessDayService } from '../business-day/business-day.service';
import { CountersService } from '../business-day/counters.service';
import { ApiError } from '../common/api-error';
import { sha256 } from '../common/crypto';
import { parseVersion } from '../common/if-match';
import { invalidReference, notFound } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { ORDER_INCLUDE, orderSubtotal, orderView, type OrderView } from './orders.views';

type Tx = Prisma.TransactionClient;

/** Orders that hold a table. */
export const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'OPEN', 'BILLED'] as const;

/** The order that holds a table right now, if any (ignoring `exceptOrderId`). */
export async function tableHolder(
  tx: Tx,
  tableId: string,
  exceptOrderId?: string,
): Promise<{ id: string } | null> {
  return tx.order.findFirst({
    where: {
      tableId,
      status: { in: [...ACTIVE_STATUSES] },
      ...(exceptOrderId ? { id: { not: exceptOrderId } } : {}),
    },
    select: { id: true },
  });
}

export const orderChanged = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'ORDER_CHANGED',
    'Someone else changed this order. It has been refreshed; check it and try again.',
  );

export const orderNotOpen = () =>
  new ApiError(HttpStatus.CONFLICT, 'ORDER_NOT_OPEN', 'This order is no longer open for changes.');

const itemAlreadySent = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'ITEM_ALREADY_SENT',
    'This item is already in the kitchen. Cancel it instead.',
  );

const VARIANT_INCLUDE = {
  item: {
    include: {
      category: true,
      taxRate: true,
      addonGroups: {
        where: { group: { archivedAt: null } },
        include: { group: { include: { addons: { where: { archivedAt: null } } } } },
      },
      components: { include: { variant: { include: { item: true } } } },
    },
  },
} satisfies Prisma.ItemVariantInclude;

type VariantForOrder = Prisma.ItemVariantGetPayload<{ include: typeof VARIANT_INCLUDE }>;

export interface MutationContext {
  tx: Tx;
  order: Order;
}

/**
 * Dine-in and parcel orders and their items. Every change bumps `orders.version` first, which
 * row-locks the order (so concurrent edits queue up) and enforces `If-Match` when sent.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly days: BusinessDayService,
    private readonly counters: CountersService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async sourceForDevice(deviceToken: unknown): Promise<OrderSource> {
    if (typeof deviceToken !== 'string' || !deviceToken) return 'POS';
    const device = await this.prisma.device.findUnique({
      where: { tokenHash: sha256(deviceToken) },
    });
    return device?.type === 'CAPTAIN' ? 'CAPTAIN' : 'POS';
  }

  async create(
    actor: AuthUser,
    request: CreateOrderRequest,
    source: OrderSource,
  ): Promise<OrderView> {
    const order = await this.prisma.$transaction(async (tx) => {
      const day = await this.days.requireOpen(tx, actor.outletId);
      const base = {
        outletId: actor.outletId,
        businessDayId: day.id,
        type: request.type,
        source,
        waiterId: actor.id,
        createdById: actor.id,
      };
      if (request.type === 'DINE_IN') {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM tables
           WHERE id = ${request.tableId}::uuid AND outlet_id = ${actor.outletId}::uuid
             AND archived_at IS NULL
           FOR UPDATE`;
        if (locked.length === 0) throw invalidReference('tableId');
        const busy = await tableHolder(tx, request.tableId);
        if (busy) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'TABLE_BUSY',
            'This table already has an order.',
            {
              orderId: busy.id,
            },
          );
        }
        return tx.order.create({
          data: { ...base, tableId: request.tableId, guests: request.guests },
          include: ORDER_INCLUDE,
        });
      }
      const tokenNo = await this.counters.next(tx, actor.outletId, 'TOKEN', day.id);
      return tx.order.create({
        data: { ...base, tokenNo, customerName: request.customerName ?? null },
        include: ORDER_INCLUDE,
      });
    });
    this.changed(order);
    return orderView(order);
  }

  async get(outletId: string, id: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { id, outletId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw notFound('Order');
    return orderView(order);
  }

  /** Orders still in progress today, newest first. */
  async active(outletId: string) {
    const orders = await this.prisma.order.findMany({
      where: { outletId, status: { in: [...ACTIVE_STATUSES] }, businessDay: { status: 'OPEN' } },
      include: { table: { select: { name: true } }, items: true },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => ({
      id: o.id,
      type: o.type,
      status: o.status,
      tableId: o.tableId,
      tableName: o.table?.name ?? null,
      tokenNo: o.tokenNo,
      customerName: o.customerName,
      guests: o.guests,
      itemCount: o.items
        .filter((i) => i.status !== 'CANCELLED')
        .reduce((n, i) => n + i.quantity, 0),
      subtotal: orderSubtotal(o.items),
      createdAt: o.createdAt,
    }));
  }

  async addItems(
    actor: AuthUser,
    orderId: string,
    ifMatch: string | undefined,
    request: AddItemsRequest,
  ) {
    return this.mutate(actor, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN') throw orderNotOpen();
      const variants = await this.loadVariants(tx, actor.outletId, request.items);
      // One millisecond apart so lines keep the order they were added in.
      const base = Date.now();
      await tx.orderItem.createMany({
        data: request.items.map((line, index) => ({
          ...this.snapshot(order, line, variants.get(line.variantId)!, actor.id),
          createdAt: new Date(base + index),
        })),
      });
    });
  }

  async updateItem(
    actor: AuthUser,
    orderId: string,
    itemId: string,
    ifMatch: string | undefined,
    request: UpdateOrderItemRequest,
  ) {
    return this.mutate(actor, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN') throw orderNotOpen();
      const item = await this.findItem(tx, orderId, itemId);
      if (item.status !== 'NEW') throw itemAlreadySent();
      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          ...(request.quantity !== undefined ? { quantity: request.quantity } : {}),
          ...(request.note !== undefined ? { note: request.note || null } : {}),
        },
      });
    });
  }

  async removeItem(actor: AuthUser, orderId: string, itemId: string, ifMatch: string | undefined) {
    return this.mutate(actor, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN') throw orderNotOpen();
      const item = await this.findItem(tx, orderId, itemId);
      if (item.status !== 'NEW') throw itemAlreadySent();
      await tx.orderItem.delete({ where: { id: itemId } });
    });
  }

  /** Cancels an order with nothing in the kitchen (wrong table, customer left). */
  async cancel(actor: AuthUser, orderId: string, ifMatch: string | undefined, reason: string) {
    const view = await this.mutate(actor, orderId, ifMatch, async ({ tx, order }) => {
      if (order.status !== 'OPEN' && order.status !== 'PENDING_APPROVAL') throw orderNotOpen();
      const sent = await tx.orderItem.count({ where: { orderId, status: 'SENT' } });
      if (sent > 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'HAS_SENT_ITEMS',
          'Some items are already in the kitchen. A manager must void this order.',
        );
      }
      await tx.orderItem.updateMany({
        where: { orderId, status: 'NEW' },
        data: { status: 'CANCELLED', cancelReason: reason, cancelledById: actor.id },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelReason: reason,
          cancelledById: actor.id,
          closedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: 'order.cancel',
          entity: 'order',
          entityId: orderId,
          reason,
        },
        tx,
      );
    });
    return view;
  }

  /**
   * Runs `fn` in a transaction after bumping the order's version (row lock + If-Match check),
   * then returns the fresh order and emits `order.updated`.
   */
  async mutate(
    actor: AuthUser,
    orderId: string,
    ifMatch: string | undefined,
    fn: (context: MutationContext) => Promise<void>,
  ): Promise<OrderView> {
    const expected = parseVersion(ifMatch);
    const order = await this.prisma.$transaction(async (tx) => {
      const bumped = await tx.$queryRaw<{ version: number }[]>`
        UPDATE orders SET version = version + 1, updated_at = now()
         WHERE id = ${orderId}::uuid AND outlet_id = ${actor.outletId}::uuid
           AND (${expected}::int IS NULL OR version = ${expected}::int)
        RETURNING version`;
      if (bumped.length === 0) {
        const exists = await tx.order.findFirst({
          where: { id: orderId, outletId: actor.outletId },
        });
        throw exists ? orderChanged() : notFound('Order');
      }
      const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      await fn({ tx, order: current });
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    });
    this.changed(order);
    return orderView(order);
  }

  changed(order: Pick<Order, 'id' | 'outletId' | 'tableId'>) {
    this.events.emit('order.updated', {
      outletId: order.outletId,
      orderId: order.id,
      tableId: order.tableId,
    });
  }

  private async findItem(tx: Tx, orderId: string, itemId: string) {
    const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw notFound('Order item');
    return item;
  }

  private async loadVariants(tx: Tx, outletId: string, lines: OrderLineRequest[]) {
    const ids = [...new Set(lines.map((l) => l.variantId))];
    const variants = await tx.itemVariant.findMany({
      where: { id: { in: ids }, item: { outletId } },
      include: VARIANT_INCLUDE,
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    for (const line of lines) {
      const variant = byId.get(line.variantId);
      if (!variant) throw invalidReference('variantId');
      const { item } = variant;
      if (variant.archivedAt || item.archivedAt || !item.isAvailable) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'ITEM_UNAVAILABLE',
          `${item.name} is not available right now.`,
          { itemId: item.id },
        );
      }
      this.checkAddons(variant, line.addonIds);
    }
    return byId;
  }

  private checkAddons(variant: VariantForOrder, addonIds: string[]) {
    const invalid = (detail: string) =>
      new ApiError(HttpStatus.BAD_REQUEST, 'ADDONS_INVALID', `${variant.item.name}: ${detail}`, {
        itemId: variant.item.id,
      });
    const groupOf = new Map<string, string>();
    for (const link of variant.item.addonGroups) {
      for (const addon of link.group.addons) groupOf.set(addon.id, link.group.id);
    }
    const picked = new Map<string, number>();
    for (const id of addonIds) {
      const groupId = groupOf.get(id);
      if (!groupId) throw invalid('that option is not offered for this item.');
      const addon = variant.item.addonGroups
        .flatMap((l) => l.group.addons)
        .find((a) => a.id === id)!;
      if (!addon.isAvailable) throw invalid(`${addon.name} is out of stock.`);
      picked.set(groupId, (picked.get(groupId) ?? 0) + 1);
    }
    for (const { group } of variant.item.addonGroups) {
      const count = picked.get(group.id) ?? 0;
      if (count < group.minSelect)
        throw invalid(`choose at least ${group.minSelect} from ${group.name}.`);
      if (count > group.maxSelect)
        throw invalid(`choose at most ${group.maxSelect} from ${group.name}.`);
    }
  }

  private snapshot(
    order: Order,
    line: OrderLineRequest,
    variant: VariantForOrder,
    createdById: string,
  ): Prisma.OrderItemCreateManyInput {
    const { item } = variant;
    const allAddons = item.addonGroups.flatMap((l) => l.group.addons);
    const parcel = order.type === 'PARCEL';
    return {
      orderId: order.id,
      itemId: item.id,
      variantId: variant.id,
      itemName: item.name,
      variantName: variant.name,
      unitPrice: parcel ? variant.parcelPrice : variant.dineInPrice,
      packagingCharge: parcel ? variant.packagingCharge : 0,
      taxRateId: item.taxRate.id,
      cgstBp: item.taxRate.cgstBp,
      sgstBp: item.taxRate.sgstBp,
      quantity: line.quantity,
      addons: line.addonIds.map((id) => {
        const addon = allAddons.find((a) => a.id === id)!;
        return { id: addon.id, name: addon.name, price: addon.price };
      }),
      comboComponents: item.isCombo
        ? item.components.map((c) => ({
            itemName: c.variant.item.name,
            variantName: c.variant.name,
            quantity: c.quantity,
          }))
        : [],
      note: line.note || null,
      stationId: item.category.stationId,
      createdById,
    };
  }
}
