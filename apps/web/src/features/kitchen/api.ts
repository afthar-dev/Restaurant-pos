import type { KotStatus } from '@rpos/shared';
import { apiFetch } from '@/shared/api/http';
import type { KdsTicket } from './types';

export interface KitchenStation {
  id: string;
  name: string;
}

// The kitchen screen signs in as a device, never as a user: no session refresh.
export const fetchKdsStations = () =>
  apiFetch<KitchenStation[]>('/api/kds/stations', { skipRefresh: true });

export const fetchKdsTickets = () => apiFetch<KdsTicket[]>('/api/kds/kots', { skipRefresh: true });

export const setKotStatus = (kotId: string, status: KotStatus) =>
  apiFetch(`/api/kds/kots/${kotId}`, { method: 'PATCH', body: { status }, skipRefresh: true });
