import type { ResolvedReason } from '@rpos/shared';
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
import { markBilledIfComplete } from '../billing/settle';
import { qrOrderEnded } from '../qr/end-sessions';
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

export { ACTIVE_STATUSES, tableHolder } from './table-holder';
import { ACTIVE_STATUSES, tableHolder } from './table-holder';

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

/** The most of one dish a single line holds (same limit as the request schema). */
const MAX_LINE_QUANTITY = 99;

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

export type VariantForOrder = Prisma.ItemVariantGetPayload<{ include: typeof VARIANT_INCLUDE }>;

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
      include: {
        table: { select: { name: true } },
        items: true,
        // Open tickets only; served and cancellation tickets are not on the stove.
        kots: {
          where: { type: 'NEW', status: { in: ['NEW', 'PREPARING', 'READY'] } },
          select: { status: true },
        },
      },
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
      /** Kitchen tickets still open: waiting or cooking, and ready to serve. */
      kitchen: {
        cooking: o.kots.filter((k) => k.status !== 'READY').length,
        ready: o.kots.filter((k) => k.status === 'READY').length,
      },
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
      await this.addLines(tx, order, request.items, actor.id);
    });
  }

  /**
   * Adds dishes to an order inside the caller's transaction, priced and snapshotted now (staff
   * ordering and approved QR requests share this path). Unavailable dishes throw.
   */
  async addLines(tx: Tx, order: Order, lines: OrderLineRequest[], actorId: string) {
    const variants = await this.loadVariants(tx, order.outletId, lines);
    // A plain dish (no add-ons, no note) tapped again joins its line that the kitchen has not
    // had yet, so the order, ticket and bill say "2 × Roti" instead of two "1 × Roti" lines.
    const unsent = await tx.orderItem.findMany({
      where: { orderId: order.id, status: 'NEW', note: null },
      select: { id: true, variantId: true, unitPrice: true, quantity: true, addons: true },
    });
    const plain = (addons: Prisma.JsonValue) => Array.isArray(addons) && addons.length === 0;
    const bumps = new Map<string, number>();
    const fresh: Prisma.OrderItemCreateManyInput[] = [];
    for (const line of lines) {
      const data = this.snapshot(order, line, variants.get(line.variantId)!, actorId);
      const joinable = line.addonIds.length === 0 && !line.note;
      const existing = joinable
        ? unsent.find(
            (i) =>
              i.variantId === data.variantId &&
              i.unitPrice === data.unitPrice &&
              plain(i.addons) &&
              i.quantity + (bumps.get(i.id) ?? 0) + data.quantity <= MAX_LINE_QUANTITY,
          )
        : undefined;
      const twin = joinable
        ? fresh.find(
            (f) =>
              f.variantId === data.variantId &&
              f.unitPrice === data.unitPrice &&
              f.note === null &&
              plain(f.addons as Prisma.JsonValue) &&
              f.quantity + data.quantity <= MAX_LINE_QUANTITY,
          )
        : undefined;
      if (existing) bumps.set(existing.id, (bumps.get(existing.id) ?? 0) + data.quantity);
      else if (twin) twin.quantity += data.quantity;
      else fresh.push(data);
    }
    for (const [id, more] of bumps) {
      await tx.orderItem.update({ where: { id }, data: { quantity: { increment: more } } });
    }
    // One millisecond apart so lines keep the order they were added in.
    const base = Date.now();
    await tx.orderItem.createMany({
      data: fresh.map((data, index) => ({ ...data, createdAt: new Date(base + index) })),
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
      // Removing the last unsent dish of a part-billed order may leave it fully billed.
      await markBilledIfComplete(tx, orderId);
    });
  }

  /** Cancels an order with nothing in the kitchen (wrong table, customer left). */
  async cancel(
    actor: AuthUser,
    orderId: string,
    ifMatch: string | undefined,
    reason: ResolvedReason,
  ) {
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
        data: {
          status: 'CANCELLED',
          cancelReason: reason.text,
          cancelReasonCode: reason.code,
          cancelledById: actor.id,
          cancelledAt: new Date(),
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelReason: reason.text,
          cancelReasonCode: reason.code,
          cancelledById: actor.id,
          closedAt: new Date(),
        },
      });
      await qrOrderEnded(tx, order);
      await this.audit.record(
        {
          outletId: actor.outletId,
          actorId: actor.id,
          action: 'order.cancel',
          entity: 'order',
          entityId: orderId,
          reason: reason.text,
          after: { reasonCode: reason.code },
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

  /** Locks a second order inside a `mutate` transaction (bumping its version), e.g. for a merge. */
  async lockAnother(tx: Tx, outletId: string, orderId: string): Promise<Order> {
    const bumped = await tx.$queryRaw<{ id: string }[]>`
      UPDATE orders SET version = version + 1, updated_at = now()
       WHERE id = ${orderId}::uuid AND outlet_id = ${outletId}::uuid
      RETURNING id`;
    if (bumped.length === 0) throw notFound('Order');
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
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

  /** Checks each line can be ordered now (variant, availability, add-on rules). */
  async loadVariants(tx: Tx, outletId: string, lines: OrderLineRequest[]) {
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
      // A no-GST dish carries 0%, so the bill adds no tax for it.
      taxRateId: item.taxRate?.id ?? null,
      cgstBp: item.taxRate?.cgstBp ?? 0,
      sgstBp: item.taxRate?.sgstBp ?? 0,
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
