import type { OrderStatus, OrderType, PaymentMode } from '@rpos/shared';

export interface BusinessDay {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openingCash: number;
  openedAt: string;
  openedBy: { id: string; name: string };
}

export interface DayBlockers {
  orders: { id: string; label: string; status: OrderStatus }[];
  bills: { id: string; orderId: string; billNo: number; due: number }[];
}

export interface CloseCheck {
  day: { id: string; openingCash: number };
  blockers: DayBlockers;
  cash: { opening: number; cashSales: number; cashExpenses: number; expected: number };
}

export interface DaySummary {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  expectedCash: number | null;
  countedCash: number | null;
  variance: number | null;
  total: number;
  /** Paid on the day's bills; `total - collected` is unpaid. */
  collected: number;
  unpaid: number;
}

/** GST at one rate: CGST + SGST percent, the taxable value and the tax on it. */
export interface GstRateRow {
  ratePercent: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

/** Mirrors DayCloseService.report() in the API. */
export interface DayReport {
  day: {
    id: string;
    status: 'OPEN' | 'CLOSED';
    openedAt: string;
    closedAt: string | null;
    openedBy: { id: string; name: string };
    closedBy: { id: string; name: string } | null;
    closeNote: string | null;
  };
  sales: {
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
  };
  payments: Record<PaymentMode, number>;
  byType: Record<OrderType, { orders: number; total: number }>;
  topItems: { itemName: string; variantName: string; quantity: number; amount: number }[];
  voids: { billNo: number; total: number; reason: string | null; by: string | null }[];
  cancels: { itemName: string; quantity: number; reason: string | null }[];
  discounts: { billNo: number; amount: number; reason: string | null }[];
  expenses: { total: number; cash: number; byCategory: { name: string; amount: number }[] };
  cash: {
    opening: number;
    cashSales: number;
    cashExpenses: number;
    expected: number;
    counted: number | null;
    variance: number | null;
  };
}
