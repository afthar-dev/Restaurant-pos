import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const DevicesPage = lazy(() =>
  import('./pages/DevicesPage').then((m) => ({ default: m.DevicesPage })),
);
export { useDevices } from './queries';
