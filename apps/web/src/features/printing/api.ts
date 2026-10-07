import { apiFetch } from '@/shared/api/http';
import type { BillPrintPayload } from './templates/billTicket';
import type { KotPrintPayload } from './templates/kotTicket';

export type PrintJob = { id: string; attempts: number } & (
  { kind: 'KOT'; payload: KotPrintPayload } | { kind: 'BILL'; payload: BillPrintPayload }
);

// A print station keeps printing after the cashier signs out, so these use the device
// cookie and never try to refresh a user session.
export const claimPrintJobs = () =>
  apiFetch<PrintJob[]>('/api/print/jobs/claim', { method: 'POST', skipRefresh: true });

export const reportPrintJob = (jobId: string, ok: boolean) =>
  apiFetch(`/api/print/jobs/${jobId}/done`, { method: 'POST', body: { ok }, skipRefresh: true });
