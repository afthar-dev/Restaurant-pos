import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Orders that hold a table. */
export const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'OPEN', 'BILLED'] as const;

/**
 * The order holding a table right now, ignoring `exceptOrderId`: its own active order, or the
 * active order it was merged into (a merged table stays taken until that bill is paid).
 */
export async function tableHolder(
  tx: Tx,
  tableId: string,
  exceptOrderId?: string,
): Promise<{ id: string } | null> {
  const except = exceptOrderId ? { id: { not: exceptOrderId } } : {};
  const own = await tx.order.findFirst({
    where: { tableId, status: { in: [...ACTIVE_STATUSES] }, ...except },
    select: { id: true },
  });
  if (own) return own;
  const merged = await tx.order.findFirst({
    where: {
      tableId,
      mergedInto: { status: { in: [...ACTIVE_STATUSES] }, ...except },
    },
    select: { mergedIntoId: true },
  });
  return merged?.mergedIntoId ? { id: merged.mergedIntoId } : null;
}
