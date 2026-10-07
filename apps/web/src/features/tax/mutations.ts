import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import { archiveTaxRate, saveTaxRate, type TaxRateInput } from './api';
import { taxKeys } from './keys';
import type { TaxRate } from './types';

/** Adds a rate, or edits `existing`. */
export function useSaveTaxRate(existing: TaxRate | null, onSaved: () => void) {
  return useInvalidatingMutation({
    mutationFn: (body: TaxRateInput) => saveTaxRate(existing, body),
    invalidates: [taxKeys.rates],
    onSuccess: onSaved,
    afterRefresh: true,
  });
}

export function useArchiveTaxRate(onArchived: () => void) {
  return useInvalidatingMutation({
    mutationFn: archiveTaxRate,
    invalidates: [taxKeys.rates],
    onSuccess: onArchived,
  });
}
