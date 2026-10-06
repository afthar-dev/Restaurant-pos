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
