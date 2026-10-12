import { Injectable } from '@nestjs/common';
import { lineTotal, type ReportRange } from '@rpos/shared';
import { PrismaService } from '../prisma/prisma.service';

type Figure = { count: number; amount: number };
const none = (): Figure => ({ count: 0, amount: 0 });

export type ReasonKindName = 'discount' | 'void' | 'cancel';

export interface StaffAccountability {
  userId: string;
  name: string;
  discounts: Figure;
  voids: Figure;
  cancels: Figure;
  reprints: number;
  cashOut: Figure;
  modeChanges: number;
}

export interface Accountability {
  byReason: { kind: ReasonKindName; code: string; count: number; amount: number }[];
  byStaff: StaffAccountability[];
}

const DAY_MS = 86_400_000;

/** The instants an India date range covers: midnight of `from` up to midnight after `to`. */
export function istRange(range: ReportRange): { gte: Date; lt: Date } {
  const gte = new Date(`${range.from}T00:00:00+05:30`);
  return { gte, lt: new Date(new Date(`${range.to}T00:00:00+05:30`).getTime() + DAY_MS) };
}

/**
 * Who gave discounts, voided bills, cancelled dishes and reprinted over a date range, and
 * why. Discounts and voids are attributed to the approving manager, like the audit trail.
 * Cash out (pay-outs and drops) is attributed to whoever recorded it, the person handling the
 * cash, not to the manager who approved it.
 * Payment mode changes count under whoever asked for the change (the audit entry's actor, the
 * person handling the payment), also not the approving manager.
 * Rows from before reason codes count as "Other". Read-only.
 */
@Injectable()
export class AccountabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async accountability(outletId: string, range: ReportRange): Promise<Accountability> {
    const when = istRange(range);
    const [discounted, voided, cancelled, reprints, cashOut, modeChanges] = await Promise.all([
      this.prisma.bill.findMany({
        where: {
          outletId,
          status: { not: 'VOID' },
          createdAt: when,
          discountById: { not: null },
        },
        select: {
          discountById: true,
          discountReasonCode: true,
          itemDiscount: true,
          billDiscount: true,
        },
      }),
      this.prisma.bill.findMany({
        where: { outletId, status: 'VOID', voidedAt: when },
        select: { voidedById: true, voidReasonCode: true, total: true },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: { outletId },
          status: 'CANCELLED',
          cancelledById: { not: null },
          OR: [{ cancelledAt: when }, { cancelledAt: null, updatedAt: when }],
        },
        select: {
          cancelledById: true,
          cancelReasonCode: true,
          unitPrice: true,
          quantity: true,
          addons: true,
        },
      }),
      this.prisma.auditEntry.groupBy({
        by: ['actorId'],
        where: { outletId, action: { in: ['bill.reprint', 'kot.reprint'] }, createdAt: when },
        _count: { _all: true },
      }),
      this.prisma.cashMovement.groupBy({
        by: ['createdById'],
        where: { outletId, type: { in: ['PAY_OUT', 'DROP'] }, createdAt: when },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.auditEntry.groupBy({
        by: ['actorId'],
        where: { outletId, action: 'payment.mode_change', createdAt: when },
        _count: { _all: true },
      }),
    ]);

    const reasons = new Map<string, Accountability['byReason'][number]>();
    const staff = new Map<string, StaffAccountability>();
    const forStaff = (userId: string): StaffAccountability => {
      let row = staff.get(userId);
      if (!row) {
        row = {
          userId,
          name: '',
          discounts: none(),
          voids: none(),
          cancels: none(),
          reprints: 0,
          cashOut: none(),
          modeChanges: 0,
        };
        staff.set(userId, row);
      }
      return row;
    };
    const add = (
      kind: ReasonKindName,
      code: string | null,
      userId: string | null,
      amount: number,
      field: 'discounts' | 'voids' | 'cancels',
    ) => {
      const key = `${kind}:${code ?? 'OTHER'}`;
      const reason = reasons.get(key) ?? { kind, code: code ?? 'OTHER', count: 0, amount: 0 };
      reason.count += 1;
      reason.amount += amount;
      reasons.set(key, reason);
      if (userId) {
        const figure = forStaff(userId)[field];
        figure.count += 1;
        figure.amount += amount;
      }
    };

    for (const b of discounted) {
      const amount = b.itemDiscount + b.billDiscount;
      if (amount > 0) add('discount', b.discountReasonCode, b.discountById, amount, 'discounts');
    }
    for (const b of voided) add('void', b.voidReasonCode, b.voidedById, b.total, 'voids');
    for (const i of cancelled) {
      const addons = Array.isArray(i.addons) ? (i.addons as { price: number }[]) : [];
      const amount = lineTotal({ unitPrice: i.unitPrice, addons, quantity: i.quantity });
      add('cancel', i.cancelReasonCode, i.cancelledById, amount, 'cancels');
    }
    for (const g of cashOut) {
      const figure = forStaff(g.createdById).cashOut;
      figure.count += g._count._all;
      figure.amount += g._sum.amount ?? 0;
    }
    for (const g of modeChanges) {
      if (g.actorId) forStaff(g.actorId).modeChanges += g._count._all;
    }
    for (const g of reprints) {
      if (g.actorId) forStaff(g.actorId).reprints += g._count._all;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...staff.keys()] } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    for (const row of staff.values()) row.name = names.get(row.userId) ?? 'Former staff';

    return {
      byReason: [...reasons.values()].sort(
        (a, b) =>
          a.kind.localeCompare(b.kind) || b.amount - a.amount || a.code.localeCompare(b.code),
      ),
      byStaff: [...staff.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
