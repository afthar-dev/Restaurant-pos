import type { GstReport, OrderType, PaymentMode } from '@rpos/shared';

/** Mirrors GstReportService in apps/api/src/reports/gst-report.service.ts. */
export type { GstReport };

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
  /** Turnover and the flat tax owed on it; only for a composition outlet, otherwise null. */
  composition: { turnover: number; taxPayable: number } | null;
  items: { itemName: string; variantName: string; quantity: number; amount: number }[];
  categories: { name: string; quantity: number; amount: number }[];
  /** Bills by India hour (0–23), only hours with bills. */
  hours: { hour: number; bills: number; total: number }[];
}

export interface AccountabilityFigure {
  count: number;
  amount: number;
}

/** Mirrors AccountabilityService in apps/api/src/reports/accountability.service.ts. */
export interface AccountabilityReport {
  byReason: { kind: 'discount' | 'void' | 'cancel'; code: string; count: number; amount: number }[];
  byStaff: {
    userId: string;
    name: string;
    discounts: AccountabilityFigure;
    voids: AccountabilityFigure;
    cancels: AccountabilityFigure;
    reprints: number;
    cashOut: AccountabilityFigure;
    modeChanges: number;
  }[];
}
