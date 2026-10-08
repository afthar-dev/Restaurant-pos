import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export { expenseKeys } from './keys';
export const ExpensesPage = lazy(() =>
  import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })),
);
