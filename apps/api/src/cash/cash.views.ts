import type { Prisma } from '@prisma/client';

export const cashMovementInclude = {
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.CashMovementInclude;

type Row = Prisma.CashMovementGetPayload<{ include: typeof cashMovementInclude }>;

export const cashMovementView = (m: Row) => ({
  id: m.id,
  businessDayId: m.businessDayId,
  type: m.type,
  amount: m.amount,
  reasonCode: m.reasonCode,
  note: m.note,
  createdBy: m.createdBy,
  approvedBy: m.approvedBy,
  createdAt: m.createdAt,
});
