import { lazy } from 'react';
// Pages load on first visit so the POS and captain screens start fast.
export const AuditPage = lazy(() =>
  import('./pages/AuditPage').then((m) => ({ default: m.AuditPage })),
);
