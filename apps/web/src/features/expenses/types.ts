import type { PaymentMode } from '@rpos/shared';

export interface ExpenseCategory {
  id: string;
  name: string;
  /** "Raw material": used by purchases, cannot be renamed or archived. */
  isSystem: boolean;
}

interface Person {
  id: string;
  name: string;
}

/** Mirrors expenseView() in apps/api/src/expenses/expense.views.ts. */
export interface Expense {
  id: string;
  businessDayId: string;
  amount: number;
  mode: PaymentMode;
  note: string | null;
  source: 'MANUAL' | 'PURCHASE';
  purchaseId: string | null;
  category: { id: string; name: string };
  createdBy: Person;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: Person | null;
  voidReason: string | null;
}

export interface ExpenseTotals {
  total: number;
  cash: number;
  byMode: Record<PaymentMode, number>;
  byCategory: { name: string; amount: number }[];
}

export interface DayExpenses {
  /** Null when no business day is open. */
  day: { id: string; status: 'OPEN' | 'CLOSED'; openedAt: string } | null;
  expenses: Expense[];
  totals: ExpenseTotals;
}

export interface NewExpense {
  categoryId: string;
  amount: number;
  mode: PaymentMode;
  note?: string;
  /** A manager's single-use approval for a large cash expense. */
  overrideToken?: string;
}

export const MODE_LABEL: Record<PaymentMode, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' };
