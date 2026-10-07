import type { Prisma, StockTxnType } from '@prisma/client';

export interface StockTxnInput {
  outletId: string;
  stockItemId: string;
  type: StockTxnType;
  /** Signed thousandths of the item's unit. */
  qtyMilli: number;
  amount?: number;
  purchaseId?: string;
  note?: string | null;
  createdById: string;
}

/**
 * The only writer of stock: records the change and moves the item's cached quantity with an
 * atomic increment, so concurrent changes never overwrite each other (spec §4.4.5).
 */
export async function postTxn(tx: Prisma.TransactionClient, input: StockTxnInput) {
  await tx.stockTxn.create({
    data: {
      outletId: input.outletId,
      stockItemId: input.stockItemId,
      type: input.type,
      qtyMilli: input.qtyMilli,
      amount: input.amount ?? null,
      purchaseId: input.purchaseId ?? null,
      note: input.note ?? null,
      createdById: input.createdById,
    },
  });
  await tx.stockItem.update({
    where: { id: input.stockItemId },
    data: { currentMilli: { increment: input.qtyMilli } },
  });
}
