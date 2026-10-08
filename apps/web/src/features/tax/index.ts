import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const TaxPage = lazy(() => import('./pages/TaxPage').then((m) => ({ default: m.TaxPage })));
export { useTaxRates } from './queries';
export { percent, type TaxRate } from './types';
