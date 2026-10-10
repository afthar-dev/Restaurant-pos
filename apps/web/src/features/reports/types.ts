import type { OrderType, PaymentMode } from '@rpos/shared';

/** GST at one rate: CGST + SGST percent, the taxable value and the tax on it. */
export interface GstRateRow {
  ratePercent: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

/** Mirrors SalesReportService.sales() in apps/api/src/reports/sales-report.service.ts. */
export interface SalesReport {
  range: { from: string; to: string };
  days: {
    dayId: string;
    date: string;
    status: 'OPEN' | 'CLOSED';
    bills: number;
    total: number;
    cash: number;
    upi: number;
    card: number;
    /** Paid on those bills; `total - collected` is unpaid. */
    collected: number;
    unpaid: number;
    expenses: number;
  }[];
  summary: {
    bills: number;
    grossSubtotal: number;
    discounts: number;
    packaging: number;
    /** Sales that carry GST. */
    taxable: number;
    /** Sales with no GST (No-GST dishes). */
    exempt: number;
    gstBreakup: GstRateRow[];
    cgst: number;
    sgst: number;
    roundOff: number;
    total: number;
    /** Paid on those bills (the payment modes added up). */
    collected: number;
    /** Billed but not yet paid: `total - collected`. */
    unpaid: number;
    averageOrder: number;
    payments: Record<PaymentMode, number>;
    byType: Record<OrderType, { orders: number; total: number }>;
    expenses: { total: number; byCategory: { name: string; amount: number }[] };
    net: number;
  };
  items: { itemName: string; variantName: string; quantity: number; amount: number }[];
  categories: { name: string; quantity: number; amount: number }[];
  /** Bills by India hour (0–23), only hours with bills. */
  hours: { hour: number; bills: number; total: number }[];
}
