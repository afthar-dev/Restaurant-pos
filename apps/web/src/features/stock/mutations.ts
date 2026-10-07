import { useRef } from 'react';
import { dayKeys } from '@/features/day';
import { expenseKeys } from '@/features/expenses';
import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import {
  adjustStock,
  archiveStockItem,
  countStock,
  createPurchase,
  saveStockItem,
  voidPurchase,
} from './api';
import { stockKeys } from './keys';
import type { NewPurchase, StockItem, StockItemInput } from './types';

/** A purchase is also a Raw material expense, which changes the day's expected cash. */
const purchaseAffects = [stockKeys.all, expenseKeys.all, dayKeys.closeCheck];

export const useSaveStockItem = (existing: StockItem | null, onSaved: () => void) =>
  useInvalidatingMutation({
    mutationFn: (body: StockItemInput) => saveStockItem(existing, body),
    invalidates: [stockKeys.all],
    onSuccess: onSaved,
    afterRefresh: true,
  });

export const useArchiveStockItem = (onArchived: () => void) =>
  useInvalidatingMutation({
    mutationFn: archiveStockItem,
    invalidates: [stockKeys.all],
    onSuccess: onArchived,
  });

export const useAdjustStock = (onDone: () => void) =>
  useInvalidatingMutation({
    mutationFn: adjustStock,
    invalidates: [stockKeys.all],
    onSuccess: onDone,
  });

export const useCountStock = (onCounted: (difference: number) => void) =>
  useInvalidatingMutation({
    mutationFn: countStock,
    invalidates: [stockKeys.all],
    onSuccess: (result) => onCounted(result.difference),
  });

/**
 * Saves a purchase. The Idempotency-Key is kept after a failure so a retry is recorded once;
 * `formChanged` drops it, because a changed purchase is a different one.
 */
export function useCreatePurchase(onSaved: () => void) {
  const key = useRef<string | null>(null);
  const mutation = useInvalidatingMutation({
    mutationFn: (body: NewPurchase) => {
      key.current ??= crypto.randomUUID();
      return createPurchase(key.current, body);
    },
    invalidates: purchaseAffects,
    onSuccess: () => {
      key.current = null;
      onSaved();
    },
  });
  return { ...mutation, formChanged: () => (key.current = null) };
}

export const useVoidPurchase = (onVoided: () => void) =>
  useInvalidatingMutation({
    mutationFn: voidPurchase,
    invalidates: purchaseAffects,
    onSuccess: onVoided,
  });
