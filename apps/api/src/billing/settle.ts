import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Marks an open bill paid once its payments cover the total (a ₹0 bill is paid at once).
 * Returns true when the bill became paid.
 */
export async function settleBill(tx: Tx, billId: string): Promise<boolean> {
  const bill = await tx.bill.findUniqueOrThrow({
    where: { id: billId },
    include: { payments: { select: { amount: true } } },
  });
  if (bill.status !== 'OPEN') return false;
  const paid = bill.payments.reduce((sum, p) => sum + p.amount, 0);
  if (paid < bill.total) return false;
  await tx.bill.update({ where: { id: billId }, data: { status: 'PAID', paidAt: new Date() } });
  return true;
}

/**
 * Closes a fully billed order once every live bill is paid; the table frees with it.
 * Split orders stay open while dishes are still unbilled (status OPEN, not BILLED).
 */
export async function closeOrderIfSettled(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== 'BILLED') return;
  const unpaid = await tx.bill.count({ where: { orderId, status: 'OPEN' } });
  if (unpaid > 0) return;
  await tx.order.update({
    where: { id: orderId },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
}

/** Quantity of each order item already on a non-void bill. */
export async function billedQuantities(tx: Tx, orderId: string): Promise<Map<string, number>> {
  const rows = await tx.billItem.groupBy({
    by: ['orderItemId'],
    where: { bill: { orderId, status: { not: 'VOID' } } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.orderItemId, r._sum.quantity ?? 0]));
}

/**
 * After dishes are cancelled or removed from a part-billed order, everything left may already
 * be billed: mark it billed (and closed when those bills are paid) so the table does not stay
 * "running" with nothing to bill.
 */
export async function markBilledIfComplete(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== 'OPEN') return;
  const liveBills = await tx.bill.count({ where: { orderId, status: { not: 'VOID' } } });
  if (liveBills === 0) return;
  const items = await tx.orderItem.findMany({
    where: { orderId, status: { in: ['NEW', 'SENT'] } },
  });
  if (items.some((i) => i.status === 'NEW')) return;
  const billed = await billedQuantities(tx, orderId);
  if (!items.every((i) => (billed.get(i.id) ?? 0) >= i.quantity)) return;
  await tx.order.update({ where: { id: orderId }, data: { status: 'BILLED' } });
  await closeOrderIfSettled(tx, orderId);
}
