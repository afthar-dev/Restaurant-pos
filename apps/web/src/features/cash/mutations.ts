import { useInvalidatingMutation } from '@/shared/api/useInvalidatingMutation';
import { addCashMovement } from './api';
import { cashKeys } from './keys';
import type { CashMovement, NewCashMovement } from './types';

/**
 * Records a pay-in, pay-out or drop. The day's close check and report are refreshed by the
 * server's `day.updated` notice (see features/realtime), as this feature sits below `day`.
 */
export const useAddCashMovement = (onAdded: (movement: CashMovement) => void) =>
  useInvalidatingMutation({
    mutationFn: (body: NewCashMovement) => addCashMovement(body),
    invalidates: [cashKeys.all],
    onSuccess: onAdded,
  });
