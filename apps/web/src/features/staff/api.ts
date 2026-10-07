import { apiFetch } from '@/shared/api/http';
import type { Staff } from './types';

export const fetchStaff = () => apiFetch<Staff[]>('/api/users');

export const saveStaff = (existing: Staff | null, body: object) =>
  existing
    ? apiFetch<Staff>(`/api/users/${existing.id}`, { method: 'PATCH', body })
    : apiFetch<Staff>('/api/users', { method: 'POST', body });

/** Archives an active member, or restores an archived one. */
export const toggleStaffArchive = (staff: Staff) =>
  apiFetch<Staff>(`/api/users/${staff.id}/${staff.archivedAt ? 'restore' : 'archive'}`, {
    method: 'POST',
  });
