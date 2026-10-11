import type { CloseCount, OrderStatus, OrderType, PaymentMode } from '@rpos/shared';

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

/** What stops the close; the closing screen asks for this alone (blind). */
export interface BlindCloseCheck {
  day: { id: string; openingCash: number };
  blockers: DayBlockers;
}

/** The close check with the cash expected in the drawer (owner Home). */
export interface CloseCheck extends BlindCloseCheck {
  cash: {
    opening: number;
    cashSales: number;
    /** Cash handed back by voiding paid bills. */
    cashRefunds: number;
    cashExpenses: number;
    expected: number;
  };
}

/** The answer to "Check count": nothing is closed or saved. */
export interface CountCheck {
  expected: number;
  variance: number;
  needsReason: boolean;
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
    /** Notes and coins counted at close; null if the day was closed with a typed total. */
    closeCount: CloseCount | null;
    closeReasonCode: string | null;
    /** The first count checked on the day (paise), only when it differs from the closing count. */
    firstCount: number | null;
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
  /** The latest reopen of this day and the close it replaced; null if never reopened. */
  reopened: {
    by: string | null;
    at: string;
    reason: string | null;
    earlier: {
      closedAt: string | null;
      closedBy: string | null;
      counted: number | null;
      expected: number | null;
      variance: number | null;
    };
  } | null;
  /** Received on the day, including bills voided since; refunds are listed apart. */
  payments: Record<PaymentMode, number>;
  /** Money handed back on this day by voiding paid bills. */
  refunds: {
    total: number;
    CASH: number;
    UPI: number;
    CARD: number;
    bills: { billNo: number; amount: number; modes: PaymentMode[]; by: string | null }[];
  };
  byType: Record<OrderType, { orders: number; total: number }>;
  topItems: { itemName: string; variantName: string; quantity: number; amount: number }[];
  /** Bills printed again, with the number of reprints (the original is not counted). */
  reprints: { billNo: number; count: number }[];
  voids: { billNo: number; total: number; reason: string | null; by: string | null }[];
  cancels: { itemName: string; quantity: number; reason: string | null }[];
  discounts: { billNo: number; amount: number; reason: string | null }[];
  expenses: { total: number; cash: number; byCategory: { name: string; amount: number }[] };
  cash: {
    opening: number;
    cashSales: number;
    cashRefunds: number;
    cashExpenses: number;
    expected: number;
    counted: number | null;
    variance: number | null;
  };
}
