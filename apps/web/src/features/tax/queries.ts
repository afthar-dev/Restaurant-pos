import { useQuery } from '@tanstack/react-query';
import { fetchTaxRates } from './api';
import { taxKeys } from './keys';

export function useTaxRates() {
  return useQuery({ queryKey: taxKeys.rates, queryFn: fetchTaxRates });
}
