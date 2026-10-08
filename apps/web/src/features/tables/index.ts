import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const TablesPage = lazy(() =>
  import('./pages/TablesPage').then((m) => ({ default: m.TablesPage })),
);
export { useFloorLayout } from './queries';
