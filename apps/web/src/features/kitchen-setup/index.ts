import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const KitchenPage = lazy(() =>
  import('./pages/KitchenPage').then((m) => ({ default: m.KitchenPage })),
);
export { usePrinters, useStations } from './queries';
export type { Station } from './types';
