import type { Prisma } from '@prisma/client';
import type { TaxBreakupRow } from './bill-calc';

export const BILL_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' } },
  payments: {
    orderBy: { createdAt: 'asc' },
    include: { receivedBy: { select: { id: true, name: true } } },
  },
  order: { select: { type: true, tokenNo: true, table: { select: { name: true } } } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.BillInclude;

export type BillWithDetails = Prisma.BillGetPayload<{ include: typeof BILL_INCLUDE }>;

const discountOf = (kind: string | null, value: number | null) =>
  kind && value !== null ? { kind, value } : null;

/** Amount received on a bill. A void bill keeps its payments for the record. */
export const paidOn = (bill: { payments: { amount: number }[] }) =>
  bill.payments.reduce((sum, p) => sum + p.amount, 0);

/** GST per rate for the bill footer, from the stored line amounts. */
export function taxBreakupOf(bill: {
  taxScheme: string;
  items: { cgstBp: number; sgstBp: number; taxable: number; cgst: number; sgst: number }[];
}): TaxBreakupRow[] {
  if (bill.taxScheme !== 'REGULAR') return [];
  const rows = new Map<string, TaxBreakupRow>();
  for (const i of bill.items) {
    const key = `${i.cgstBp}/${i.sgstBp}`;
    const row = rows.get(key) ?? {
      cgstBp: i.cgstBp,
      sgstBp: i.sgstBp,
      taxable: 0,
      cgst: 0,
      sgst: 0,
    };
    row.taxable += i.taxable;
    row.cgst += i.cgst;
    row.sgst += i.sgst;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.cgstBp + a.sgstBp - (b.cgstBp + b.sgstBp));
}

export function billView(bill: BillWithDetails) {
  const paid = paidOn(bill);
  return {
    id: bill.id,
    billNo: bill.billNo,
    financialYear: bill.financialYear,
    status: bill.status,
    title: bill.taxScheme === 'REGULAR' ? 'Tax Invoice' : 'Bill of Supply',
    orderId: bill.orderId,
    orderType: bill.order.type,
    tableName: bill.order.table?.name ?? null,
    tokenNo: bill.order.tokenNo,
    lines: bill.items.map((i) => ({
      id: i.id,
      orderItemId: i.orderItemId,
      itemName: i.itemName,
      variantName: i.variantName,
      addons: (i.addons as { name: string; price: number }[]).map((a) => ({
        name: a.name,
        price: a.price,
      })),
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      gross: i.gross,
      discount: discountOf(i.discountKind, i.discountValue),
      itemDiscount: i.itemDiscount,
      lineTotal: i.lineTotal,
    })),
    grossSubtotal: bill.grossSubtotal,
    itemDiscount: bill.itemDiscount,
    subtotal: bill.subtotal,
    discount: discountOf(bill.discountKind, bill.discountValue),
    billDiscount: bill.billDiscount,
    discountReason: bill.discountReason,
    packaging: bill.packaging,
    taxable: bill.taxable,
    cgst: bill.cgst,
    sgst: bill.sgst,
    taxBreakup: taxBreakupOf(bill),
    roundOff: bill.roundOff,
    total: bill.total,
    paid,
    due: bill.status === 'VOID' ? 0 : Math.max(0, bill.total - paid),
    payments: bill.payments.map((p) => ({
      id: p.id,
      mode: p.mode,
      amount: p.amount,
      tendered: p.tendered,
      change: p.change,
      reference: p.reference,
      receivedBy: p.receivedBy,
      createdAt: p.createdAt,
    })),
    voidReason: bill.voidReason,
    version: bill.version,
    createdAt: bill.createdAt,
    createdBy: bill.createdBy,
  };
}

export type BillView = ReturnType<typeof billView>;
