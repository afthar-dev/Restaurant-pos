import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export { kitchenKeys } from './keys';
export const KdsPage = lazy(() => import('./pages/KdsPage').then((m) => ({ default: m.KdsPage })));
export { useStationFilter } from './store';
