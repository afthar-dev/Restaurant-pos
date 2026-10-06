import type { Prisma } from '@prisma/client';
import { pendingView } from '../qr/qr.views';
import { lineTotal } from '@rpos/shared';

export const ORDER_INCLUDE = {
  table: { select: { id: true, name: true } },
  waiter: { select: { id: true, name: true } },
  mergedFrom: { select: { table: { select: { id: true, name: true } } } },
  qrSubmissions: { where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } },
  items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  kots: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      kotNo: true,
      type: true,
      status: true,
      stationId: true,
      stationName: true,
      createdAt: true,
      printJobs: {
        orderBy: { createdAt: 'asc' },
        select: { printerId: true, status: true },
      },
    },
  },
  bills: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      billNo: true,
      status: true,
      total: true,
      payments: { select: { amount: true } },
      items: { select: { orderItemId: true, quantity: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
/**
 * Whether a KOT reached paper. Uses each printer's latest job (a reprint supersedes a failure).
 * NONE: no printer covers the station. WAITING: queued (or no device is set to print it).
 */
export function kotPrintState(
  jobs: { printerId: string; status: string }[],
): 'NONE' | 'WAITING' | 'PRINTED' | 'FAILED' {
  if (jobs.length === 0) return 'NONE';
  const latest = new Map<string, { status: string }>();
  for (const job of jobs) latest.set(job.printerId, job);
  const states = [...latest.values()];
  if (states.some((j) => j.status === 'FAILED')) return 'FAILED';
  if (states.some((j) => j.status === 'PENDING')) return 'WAITING';
  return 'PRINTED';
}

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
  const billed = new Map<string, number>();
  for (const bill of order.bills) {
    if (bill.status === 'VOID') continue;
    for (const line of bill.items) {
      billed.set(line.orderItemId, (billed.get(line.orderItemId) ?? 0) + line.quantity);
    }
  }
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
      stationId: i.stationId,
      createdAt: i.createdAt,
      lineTotal: itemTotal(i),
      billedQuantity: billed.get(i.id) ?? 0,
    })),
    kots: order.kots.map(({ printJobs, ...kot }) => ({ ...kot, print: kotPrintState(printJobs) })),
    mergedTables: order.mergedFrom.flatMap((m) => (m.table ? [m.table] : [])),
    /** Dishes customers asked for from the table QR, waiting for staff. */
    qrPending: order.qrSubmissions.map((s) => pendingView(s)),
    bills: order.bills.map((b) => ({
      id: b.id,
      billNo: b.billNo,
      status: b.status,
      total: b.total,
      paid: b.payments.reduce((sum, p) => sum + p.amount, 0),
    })),
    subtotal: orderSubtotal(order.items),
  };
}

export type OrderView = ReturnType<typeof orderView>;
