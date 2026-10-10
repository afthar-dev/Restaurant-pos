import { newId } from '@rpos/shared';
import { useRef } from 'react';
import { dayKeys } from '@/features/day';
import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import { addCategory, addExpense, archiveCategory, renameCategory, voidExpense } from './api';
import { expenseKeys } from './keys';
import type { NewExpense } from './types';

/** Expenses change the day's expected cash, so the close check refreshes with them. */
const affected = [expenseKeys.all, dayKeys.closeCheck];

/**
 * Records an expense. The Idempotency-Key is kept after a failure, so a retry of the same
 * entry is saved once; `formChanged` drops it, because a changed entry is a new expense.
 */
export function useAddExpense(onAdded: () => void) {
  const key = useRef<string | null>(null);
  const mutation = useInvalidatingMutation({
    mutationFn: (body: NewExpense) => {
      key.current ??= newId();
      return addExpense(key.current, body);
    },
    invalidates: affected,
    onSuccess: () => {
      key.current = null;
      onAdded();
    },
  });
  return { ...mutation, formChanged: () => (key.current = null) };
}

export const useVoidExpense = (onVoided: () => void) =>
  useInvalidatingMutation({ mutationFn: voidExpense, invalidates: affected, onSuccess: onVoided });

export const useAddCategory = (onAdded: () => void) =>
  useInvalidatingMutation({
    mutationFn: addCategory,
    invalidates: [expenseKeys.categories],
    onSuccess: onAdded,
  });

export const useRenameCategory = (onRenamed: () => void) =>
  useInvalidatingMutation({
    mutationFn: renameCategory,
    invalidates: [expenseKeys.categories, expenseKeys.all],
    onSuccess: onRenamed,
    afterRefresh: true,
  });

export const useArchiveCategory = (onArchived: () => void) =>
  useInvalidatingMutation({
    mutationFn: archiveCategory,
    invalidates: [expenseKeys.categories],
    onSuccess: onArchived,
  });
