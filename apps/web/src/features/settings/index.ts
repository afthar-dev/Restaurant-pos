import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
export { useOutlet } from './queries';
