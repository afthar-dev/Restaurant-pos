import type { Prisma } from '@prisma/client';

export const expenseInclude = {
  category: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

export function expenseView(e: ExpenseRow) {
  return {
    id: e.id,
    businessDayId: e.businessDayId,
    amount: e.amount,
    mode: e.mode,
    note: e.note,
    source: e.source,
    purchaseId: e.purchaseId,
    category: e.category,
    createdBy: e.createdBy,
    createdAt: e.createdAt,
    voidedAt: e.voidedAt,
    voidedBy: e.voidedBy,
    voidReason: e.voidReason,
  };
}
