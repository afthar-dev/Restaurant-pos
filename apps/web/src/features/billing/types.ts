import type { BillStatus, OrderType, PaymentMode } from '@rpos/shared';

export interface Discount {
  kind: 'FLAT' | 'PERCENT';
  /** FLAT: paise. PERCENT: basis points. */
  value: number;
}

export interface BillLine {
  id: string;
  orderItemId: string;
  itemName: string;
  variantName: string;
  addons: { name: string; price: number }[];
  /** Per unit, add-ons included. */
  unitPrice: number;
  quantity: number;
  gross: number;
  discount: Discount | null;
  itemDiscount: number;
  lineTotal: number;
}

export interface BillPayment {
  id: string;
  mode: PaymentMode;
  amount: number;
  tendered: number | null;
  change: number | null;
  reference: string | null;
  receivedBy: { id: string; name: string };
  createdAt: string;
}

export interface TaxRow {
  cgstBp: number;
  sgstBp: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

/** Mirrors billView() in apps/api/src/billing/bill.views.ts. */
export interface Bill {
  id: string;
  billNo: number;
  financialYear: string;
  status: BillStatus;
  title: 'Tax Invoice' | 'Bill of Supply' | 'Bill';
  orderId: string;
  orderType: OrderType;
  tableName: string | null;
  tokenNo: number | null;
  lines: BillLine[];
  grossSubtotal: number;
  itemDiscount: number;
  subtotal: number;
  discount: Discount | null;
  billDiscount: number;
  discountReason: string | null;
  packaging: number;
  taxable: number;
  /** Sales with no GST (No-GST dishes). */
  exempt: number;
  cgst: number;
  sgst: number;
  taxBreakup: TaxRow[];
  roundOff: number;
  total: number;
  paid: number;
  due: number;
  payments: BillPayment[];
  /** Optional B2B customer printed under the bill header. */
  customer: { name: string | null; gstin: string | null };
  voidReason: string | null;
  version: number;
  createdAt: string;
  createdBy: { id: string; name: string };
}
