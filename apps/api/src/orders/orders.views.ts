import type { Prisma } from '@prisma/client';
import { lineTotal } from '@rpos/shared';

export const ORDER_INCLUDE = {
  table: { select: { id: true, name: true } },
  waiter: { select: { id: true, name: true } },
  items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  kots: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, kotNo: true, type: true, status: true, stationName: true, createdAt: true },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export interface AddonSnapshot {
  id: string;
  name: string;
  price: number;
}

export function itemTotal(item: { unitPrice: number; addons: unknown; quantity: number }): number {
  return lineTotal({
    unitPrice: item.unitPrice,
    addons: item.addons as AddonSnapshot[],
    quantity: item.quantity,
  });
}

export function orderSubtotal(
  items: { status: string; unitPrice: number; addons: unknown; quantity: number }[],
) {
  return items.filter((i) => i.status !== 'CANCELLED').reduce((sum, i) => sum + itemTotal(i), 0);
}

export function orderView(order: OrderWithDetails) {
  return {
    id: order.id,
    type: order.type,
    source: order.source,
    status: order.status,
    table: order.table,
    tokenNo: order.tokenNo,
    guests: order.guests,
    customerName: order.customerName,
    waiter: order.waiter,
    version: order.version,
    cancelReason: order.cancelReason,
    createdAt: order.createdAt,
    items: order.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      variantId: i.variantId,
      itemName: i.itemName,
      variantName: i.variantName,
      unitPrice: i.unitPrice,
      packagingCharge: i.packagingCharge,
      cgstBp: i.cgstBp,
      sgstBp: i.sgstBp,
      quantity: i.quantity,
      addons: i.addons as unknown as AddonSnapshot[],
      comboComponents: i.comboComponents,
      note: i.note,
      status: i.status,
      kotId: i.kotId,
      cancelReason: i.cancelReason,
      lineTotal: itemTotal(i),
    })),
    kots: order.kots,
    subtotal: orderSubtotal(order.items),
  };
}

export type OrderView = ReturnType<typeof orderView>;
