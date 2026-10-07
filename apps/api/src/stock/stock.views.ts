import type { Prisma, StockItem } from '@prisma/client';

export interface LastPurchase {
  date: Date;
  /** Paise per whole unit (₹40 per kg = 4000). */
  rate: number;
}

export function stockItemView(item: StockItem, lastPurchase: LastPurchase | null = null) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    minLevelMilli: item.minLevelMilli,
    currentMilli: item.currentMilli,
    low: item.minLevelMilli > 0 && item.currentMilli <= item.minLevelMilli,
    lastPurchase,
    archivedAt: item.archivedAt,
  };
}

export const rateOf = (amount: number, qtyMilli: number) => Math.round((amount * 1000) / qtyMilli);

export const purchaseInclude = {
  lines: { include: { stockItem: { select: { name: true, unit: true } } } },
  createdBy: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseInclude;

type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

export function purchaseView(p: PurchaseRow) {
  return {
    id: p.id,
    businessDayId: p.businessDayId,
    vendorName: p.vendorName,
    billRef: p.billRef,
    paidMode: p.paidMode,
    total: p.total,
    note: p.note,
    createdAt: p.createdAt,
    createdBy: p.createdBy,
    voidedAt: p.voidedAt,
    voidedBy: p.voidedBy,
    voidReason: p.voidReason,
    lines: p.lines.map((l) => ({
      id: l.id,
      stockItemId: l.stockItemId,
      itemName: l.stockItem.name,
      unit: l.stockItem.unit,
      qtyMilli: l.qtyMilli,
      amount: l.amount,
    })),
  };
}
