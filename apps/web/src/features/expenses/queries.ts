import { useQuery } from '@tanstack/react-query';
import { POLL_MS } from '@/shared/api/queryClient';
import { fetchCategories, fetchExpenses } from './api';
import { expenseKeys } from './keys';

export function useExpenseCategories() {
  return useQuery({ queryKey: expenseKeys.categories, queryFn: fetchCategories });
}

/** The day's expenses and totals; "current" follows the open day. */
export function useDayExpenses(day = 'current') {
  return useQuery({
    queryKey: expenseKeys.forDay(day),
    queryFn: () => fetchExpenses(day),
    refetchInterval: POLL_MS,
  });
}
