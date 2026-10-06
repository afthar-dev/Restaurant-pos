import type { Prisma } from '@prisma/client';
import { tableHolder } from '../orders/table-holder';

/**
 * The table is free again (paid, cancelled, voided or moved away): phones that scanned it
 * must scan again, so the next party starts fresh (spec §6.2 "rotated on table close").
 * Does nothing while another order still holds the table.
 */
export async function endQrSessions(tx: Prisma.TransactionClient, tableId: string | null) {
  if (!tableId) return;
  if (await tableHolder(tx, tableId)) return;
  await tx.qrSession.updateMany({
    where: { tableId, endedAt: null },
    data: { endedAt: new Date() },
  });
}
