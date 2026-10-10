import { apiFetch } from '@/shared/api/http';
import type { OutletSettings } from './types';

export const fetchOutlet = () => apiFetch<OutletSettings>('/api/outlet');

export const updateOutlet = (changes: Partial<OutletSettings>) =>
  apiFetch<OutletSettings>('/api/outlet', { method: 'PATCH', body: changes });

export function uploadLogo(image: Blob) {
  const body = new FormData();
  body.append('image', image, 'logo');
  return apiFetch<OutletSettings>('/api/outlet/logo', { method: 'PUT', body });
}

export const removeLogo = () => apiFetch<OutletSettings>('/api/outlet/logo', { method: 'DELETE' });
