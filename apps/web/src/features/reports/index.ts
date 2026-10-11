import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
export { reportKeys } from './keys';
export { useDaySalesReport, useSalesReport } from './queries';
export { presetRange } from './ranges';
export type { SalesReport } from './types';
export { WeekTrend } from './components/WeekTrend';
export { HourlySales } from './components/HourlySales';
export { TopDishes } from './charts/TopDishes';
export { percentShares } from './charts/scale';
