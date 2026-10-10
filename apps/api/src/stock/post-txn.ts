import { HttpStatus } from '@nestjs/common';
import type { Prisma, StockTxnType } from '@prisma/client';
import { ApiError } from '../common/api-error';

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

/** Stock is kept in an `Int` column; stay clear of its edge (2^31 − 1) either way. */
export const STOCK_MILLI_LIMIT = 2_000_000_000;

const tooLarge = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'STOCK_TOO_LARGE',
    'That quantity is too large. Count this item to reset its stock.',
  );

/**
 * The only writer of stock: records the change and moves the item's cached quantity with an
 * atomic increment, so concurrent changes never overwrite each other (spec §4.4.5). A change
 * that would take the balance past ±2,000,000,000 thousandths is refused.
 */
export async function postTxn(tx: Prisma.TransactionClient, input: StockTxnInput) {
  if (Math.abs(input.qtyMilli) > STOCK_MILLI_LIMIT) throw tooLarge();
  // The sum is worked out as bigint, so the check itself cannot overflow.
  const moved = await tx.$executeRaw`
    UPDATE stock_items
       SET current_milli = (current_milli::bigint + ${input.qtyMilli}::bigint)::int,
           updated_at = now()
     WHERE id = ${input.stockItemId}::uuid
       AND abs(current_milli::bigint + ${input.qtyMilli}::bigint) <= ${STOCK_MILLI_LIMIT}::bigint`;
  if (moved === 0) throw tooLarge();
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
}
