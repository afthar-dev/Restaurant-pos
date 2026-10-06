import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../auth/api';
import { menuKey, type Menu } from '../pages/admin/menu-types';
import type { ActiveOrder, BusinessDay, FloorAreaStatus, Order } from './types';

/** Screens also poll, so they recover even if realtime notices are lost. */
export const POLL_MS = 15_000;

export function useBusinessDay() {
  return useQuery({
    queryKey: ['business-day'],
    queryFn: () => apiFetch<{ day: BusinessDay | null }>('/api/business-day/current'),
    refetchInterval: POLL_MS,
  });
}

export function useFloorStatus() {
  return useQuery({
    queryKey: ['floor', 'status'],
    queryFn: () => apiFetch<FloorAreaStatus[]>('/api/floor/status'),
    refetchInterval: POLL_MS,
  });
}

export function useActiveOrders() {
  return useQuery({
    queryKey: ['orders', 'active'],
    queryFn: () => apiFetch<ActiveOrder[]>('/api/orders?status=active'),
    refetchInterval: POLL_MS,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => apiFetch<Order>(`/api/orders/${id}`),
    enabled: Boolean(id),
    refetchInterval: POLL_MS,
  });
}

export function useMenu() {
  return useQuery({ queryKey: menuKey, queryFn: () => apiFetch<Menu>('/api/menu') });
}
