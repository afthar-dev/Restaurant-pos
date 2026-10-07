import { apiFetch } from '@/shared/api/http';
import type { OutletSettings } from './types';

export const fetchOutlet = () => apiFetch<OutletSettings>('/api/outlet');

export const updateOutlet = (changes: Partial<OutletSettings>) =>
  apiFetch<OutletSettings>('/api/outlet', { method: 'PATCH', body: changes });
