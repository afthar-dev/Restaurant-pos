import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export { DayGate } from './components/DayGate';
export { dayKeys } from './keys';
export { useBusinessDay, useCloseCheck } from './queries';
export const DayPage = lazy(() => import('./pages/DayPage').then((m) => ({ default: m.DayPage })));
export type { DayReport } from './types';
