import { z } from 'zod';
import { DROP_REASONS, PAY_IN_REASONS, PAY_OUT_REASONS } from './reasons';

export const CASH_MOVEMENT_TYPES = ['PAY_IN', 'PAY_OUT', 'DROP'] as const;
export type CashMovementKind = (typeof CASH_MOVEMENT_TYPES)[number];

/** The reason codes each kind of movement accepts. */
export const CASH_REASONS: Record<CashMovementKind, readonly string[]> = {
  PAY_IN: PAY_IN_REASONS,
  PAY_OUT: PAY_OUT_REASONS,
  DROP: DROP_REASONS,
};

/** The reason-label kind (see `reasonLabel`) for each kind of movement. */
export const CASH_REASON_KIND = { PAY_IN: 'payIn', PAY_OUT: 'payOut', DROP: 'drop' } as const;

/** Up to ₹1 crore in one movement. */
export const cashMovementSchema = z
  .strictObject({
    type: z.enum(CASH_MOVEMENT_TYPES),
    amount: z.number().int().min(1, 'Enter an amount').max(1_000_000_000, 'Amount is too large'),
    reasonCode: z.string().min(1, 'Choose a reason'),
    note: z.string().trim().max(200).optional(),
    /** A manager's single-use approval, from POST /auth/override. */
    overrideToken: z.string().min(1).max(2000).optional(),
  })
  .refine((v) => CASH_REASONS[v.type].includes(v.reasonCode), {
    path: ['reasonCode'],
    message: 'Choose a reason.',
  })
  .refine((v) => v.reasonCode !== 'OTHER' || (v.note?.length ?? 0) >= 3, {
    path: ['note'],
    message: 'Say what happened.',
  });
export type CashMovementRequest = z.infer<typeof cashMovementSchema>;
