import type { OrderType, PaymentMode } from '@rpos/shared';

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
    expenses: number;
  }[];
  summary: {
    bills: number;
    grossSubtotal: number;
    discounts: number;
    packaging: number;
    taxable: number;
    cgst: number;
    sgst: number;
    roundOff: number;
    total: number;
    averageBill: number;
    payments: Record<PaymentMode, number>;
    byType: Record<OrderType, { orders: number; total: number }>;
    expenses: { total: number; byCategory: { name: string; amount: number }[] };
    net: number;
  };
  items: { itemName: string; variantName: string; quantity: number; amount: number }[];
  categories: { name: string; quantity: number; amount: number }[];
}
