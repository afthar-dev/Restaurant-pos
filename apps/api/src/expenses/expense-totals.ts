import type { PaymentMode, Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'expense'>;

export interface ExpenseTotals {
  total: number;
  cash: number;
  byMode: Record<PaymentMode, number>;
  /** Largest first. */
  byCategory: { name: string; amount: number }[];
}

/** What a business day spent, voided expenses left out. Day close and the expense list use it. */
export async function expenseTotals(db: Db, businessDayId: string): Promise<ExpenseTotals> {
  const live = await db.expense.findMany({
    where: { businessDayId, voidedAt: null },
    select: { amount: true, mode: true, category: { select: { name: true } } },
  });
  const byMode: Record<PaymentMode, number> = { CASH: 0, UPI: 0, CARD: 0 };
  const byName = new Map<string, number>();
  for (const e of live) {
    byMode[e.mode] += e.amount;
    byName.set(e.category.name, (byName.get(e.category.name) ?? 0) + e.amount);
  }
  return {
    total: byMode.CASH + byMode.UPI + byMode.CARD,
    cash: byMode.CASH,
    byMode,
    byCategory: [...byName]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
  };
}

/** The day's cash that left the drawer (expected cash = opening + cash sales − this). */
export async function cashExpenses(db: Db, businessDayId: string): Promise<number> {
  const result = await db.expense.aggregate({
    where: { businessDayId, voidedAt: null, mode: 'CASH' },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}
