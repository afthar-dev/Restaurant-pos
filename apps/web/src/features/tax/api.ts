import { apiFetch } from '@/shared/api/http';
import type { TaxRate } from './types';

export interface TaxRateInput {
  name: string;
  totalBp: number;
}

export const fetchTaxRates = () => apiFetch<TaxRate[]>('/api/tax-rates');

export const saveTaxRate = (existing: TaxRate | null, body: TaxRateInput) =>
  existing
    ? apiFetch(`/api/tax-rates/${existing.id}`, { method: 'PUT', body })
    : apiFetch('/api/tax-rates', { method: 'POST', body });

export const archiveTaxRate = (rate: TaxRate) =>
  apiFetch(`/api/tax-rates/${rate.id}/archive`, { method: 'POST' });
