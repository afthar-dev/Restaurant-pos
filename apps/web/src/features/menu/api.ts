import type { BulkPriceRequest } from '@rpos/shared';
import { apiFetch } from '@/shared/api/http';
import type { Menu, MenuAddon, MenuAddonGroup, MenuCategory, MenuItem } from './types';

export const fetchMenu = () => apiFetch<Menu>('/api/menu');

export const addCategory = (body: object) =>
  apiFetch('/api/menu/categories', { method: 'POST', body });

export const updateCategory = (category: MenuCategory, body: object) =>
  apiFetch(`/api/menu/categories/${category.id}`, { method: 'PUT', body });

export const archiveCategory = (category: MenuCategory) =>
  apiFetch(`/api/menu/categories/${category.id}/archive`, { method: 'POST' });

export const saveItem = (existing: MenuItem | null, body: object) =>
  existing
    ? apiFetch(`/api/menu/items/${existing.id}`, { method: 'PUT', body })
    : apiFetch('/api/menu/items', { method: 'POST', body });

export const archiveItem = (item: MenuItem) =>
  apiFetch(`/api/menu/items/${item.id}/archive`, { method: 'POST' });

export const fetchAddonGroups = () => apiFetch<MenuAddonGroup[]>('/api/menu/addon-groups');

export const saveAddonGroup = (existing: MenuAddonGroup | null, body: object) =>
  existing
    ? apiFetch(`/api/menu/addon-groups/${existing.id}`, { method: 'PUT', body })
    : apiFetch('/api/menu/addon-groups', { method: 'POST', body });

export const archiveAddonGroup = (group: MenuAddonGroup) =>
  apiFetch(`/api/menu/addon-groups/${group.id}/archive`, { method: 'POST' });

export const setItemAvailability = (item: MenuItem, isAvailable: boolean) =>
  apiFetch(`/api/menu/items/${item.id}/availability`, {
    method: 'PATCH',
    body: { isAvailable },
  });

export const setAddonAvailability = (addon: MenuAddon, isAvailable: boolean) =>
  apiFetch(`/api/menu/addons/${addon.id}/availability`, {
    method: 'PATCH',
    body: { isAvailable },
  });

export const bulkPrices = (body: BulkPriceRequest) =>
  apiFetch<{ updated: number }>('/api/menu/prices', { method: 'POST', body });

export const reorderCategories = (ids: string[]) =>
  apiFetch('/api/menu/categories/order', { method: 'PUT', body: { ids } });

export const reorderItems = (categoryId: string, ids: string[]) =>
  apiFetch(`/api/menu/categories/${categoryId}/items/order`, { method: 'PUT', body: { ids } });
