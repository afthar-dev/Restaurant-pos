import type { Prisma } from '@prisma/client';
import { tableHolder } from '../orders/table-holder';

type Tx = Prisma.TransactionClient;

/**
 * The table is free again: phones that scanned it must scan again, so the next party starts
 * fresh (spec §6.2 "rotated on table close"). Does nothing while another order still holds
 * the table.
 */
export async function endQrSessions(tx: Tx, tableId: string | null) {
  if (!tableId) return;
  if (await tableHolder(tx, tableId)) return;
  await tx.qrSession.updateMany({
    where: { tableId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

/**
 * An order stopped holding its tables (paid and closed, cancelled or voided). Requests still
 * waiting on it can no longer be approved, so they are turned down (the phones show "please
 * call the waiter"), and the phones at its own table and at every table merged into it are
 * signed off.
 */
export async function qrOrderEnded(tx: Tx, order: { id: string; tableId: string | null }) {
  await tx.qrSubmission.updateMany({
    where: { orderId: order.id, status: 'PENDING' },
    data: { status: 'REJECTED', rejectReason: 'Table closed', decidedAt: new Date() },
  });
  const merged = await tx.order.findMany({
    where: { mergedIntoId: order.id },
    select: { tableId: true },
  });
  for (const tableId of new Set([order.tableId, ...merged.map((m) => m.tableId)])) {
    await endQrSessions(tx, tableId);
  }
}
