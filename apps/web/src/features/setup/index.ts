import { lazy } from 'react';

export const SetupPage = lazy(() =>
  import('./pages/SetupPage').then((m) => ({ default: m.SetupPage })),
);
export { SETUP_PERMISSIONS } from './steps';
export { useSetupProgress } from './useSetupProgress';
export { SetupCard } from './components/SetupCard';
