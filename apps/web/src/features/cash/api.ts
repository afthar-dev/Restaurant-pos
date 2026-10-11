import { apiFetch } from '@/shared/api/http';
import type { CashMovement, NewCashMovement } from './types';

export const addCashMovement = (body: NewCashMovement) =>
  apiFetch<CashMovement>('/api/cash-movements', { method: 'POST', body });
