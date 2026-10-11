import { useQuery } from '@tanstack/react-query';
import { fetchPurchases, fetchStockItems, fetchStockTxns } from './api';
import { stockKeys } from './keys';

export function useStockItems(enabled = true) {
  return useQuery({ queryKey: stockKeys.items, queryFn: fetchStockItems, enabled });
}

export function useStockTxns(itemId: string) {
  return useQuery({ queryKey: stockKeys.txns(itemId), queryFn: () => fetchStockTxns(itemId) });
}

/** "current" (the open day), "all", or a business day id. */
export function usePurchases(day = 'current') {
  return useQuery({ queryKey: stockKeys.purchases(day), queryFn: () => fetchPurchases(day) });
}
