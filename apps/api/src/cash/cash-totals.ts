import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'cashMovement'>;

export interface CashMovementTotals {
  payIn: number;
  payOut: number;
  drop: number;
}

/** What went into and out of the drawer on a business day, apart from sales and expenses. */
export async function cashMovementTotals(
  db: Db,
  businessDayId: string,
): Promise<CashMovementTotals> {
  const groups = await db.cashMovement.groupBy({
    by: ['type'],
    where: { businessDayId },
    _sum: { amount: true },
  });
  const sumOf = (type: 'PAY_IN' | 'PAY_OUT' | 'DROP') =>
    groups.find((g) => g.type === type)?._sum.amount ?? 0;
  return { payIn: sumOf('PAY_IN'), payOut: sumOf('PAY_OUT'), drop: sumOf('DROP') };
}
