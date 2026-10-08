import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export { stockKeys } from './keys';
export const PurchasesPage = lazy(() =>
  import('./pages/PurchasesPage').then((m) => ({ default: m.PurchasesPage })),
);
export const StockPage = lazy(() =>
  import('./pages/StockPage').then((m) => ({ default: m.StockPage })),
);
export { useStockItems } from './queries';
