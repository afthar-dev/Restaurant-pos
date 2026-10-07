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
  bills: { id: string; billNo: number; due: number }[];
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
    taxable: number;
    cgst: number;
    sgst: number;
    roundOff: number;
    total: number;
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
