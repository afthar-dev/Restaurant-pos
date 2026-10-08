import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const StaffPage = lazy(() =>
  import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })),
);
export type { Staff } from './types';
export { useStaff } from './queries';
