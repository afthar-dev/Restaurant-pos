import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
export { useSalesReport } from './queries';
export { presetRange } from './ranges';
export { WeekTrend } from './components/WeekTrend';
