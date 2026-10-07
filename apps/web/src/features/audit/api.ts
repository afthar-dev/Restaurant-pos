import { apiFetch } from '@/shared/api/http';

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  reason: string | null;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

export const AUDIT_PAGE_SIZE = 50;

/** One page of the log, newest first; `before` is the last row's time on the previous page. */
export const fetchAuditPage = (before: string | null) =>
  apiFetch<AuditRow[]>(
    `/api/audit?limit=${AUDIT_PAGE_SIZE}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
  );
