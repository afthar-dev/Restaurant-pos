import { z } from 'zod';

/** Why a kitchen ticket is printed again. */
export const KOT_REPRINT_REASONS = ['PRINTER_JAM', 'KITCHEN_LOST', 'OTHER'] as const;
export type KotReprintReason = (typeof KOT_REPRINT_REASONS)[number];

/** Why a bill is discounted. */
export const DISCOUNT_REASONS = [
  'REGULAR',
  'COMPLAINT',
  'COMPLIMENTARY',
  'STAFF_MEAL',
  'MANAGER_OFFER',
  'OTHER',
] as const;
export type DiscountReason = (typeof DISCOUNT_REASONS)[number];

/** Why a bill is voided. */
export const VOID_REASONS = [
  'WRONG_ORDER',
  'CUSTOMER_LEFT',
  'DUPLICATE',
  'PAYMENT_ISSUE',
  'OTHER',
] as const;
export type VoidReason = (typeof VOID_REASONS)[number];

/** Why a dish or an order is cancelled. */
export const CANCEL_REASONS = [
  'CHANGED_MIND',
  'OUT_OF_STOCK',
  'WRONG_DISH',
  'LONG_WAIT',
  'OTHER',
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/** Why the cash counted at day close is far from what was expected. */
export const CLOSE_VARIANCE_REASONS = [
  'SHORT_CHANGE',
  'EXPENSE_MISSING',
  'COUNT_ERROR',
  'OTHER',
] as const;
export type CloseVarianceReason = (typeof CLOSE_VARIANCE_REASONS)[number];

/** Why cash is put into the drawer, taken out of it, or dropped to the safe or bank. */
export const PAY_IN_REASONS = ['FLOAT_TOP_UP', 'OTHER'] as const;
export const PAY_OUT_REASONS = ['SUPPLIER', 'STAFF_ADVANCE', 'OTHER'] as const;
export const DROP_REASONS = ['SAFE', 'BANK', 'OTHER'] as const;

/** Each kind of reason list, keyed by name. */
export const REASON_LABELS = {
  kotReprint: {
    PRINTER_JAM: 'Printer jam',
    KITCHEN_LOST: 'Kitchen lost it',
    OTHER: 'Other',
  },
  discount: {
    REGULAR: 'Regular customer',
    COMPLAINT: 'Complaint',
    COMPLIMENTARY: 'Complimentary',
    STAFF_MEAL: 'Staff meal',
    MANAGER_OFFER: 'Manager offer',
    OTHER: 'Other',
  },
  void: {
    WRONG_ORDER: 'Wrong order',
    CUSTOMER_LEFT: 'Customer left',
    DUPLICATE: 'Duplicate bill',
    PAYMENT_ISSUE: 'Payment issue',
    OTHER: 'Other',
  },
  cancel: {
    CHANGED_MIND: 'Customer changed mind',
    OUT_OF_STOCK: 'Out of stock',
    WRONG_DISH: 'Wrong dish',
    LONG_WAIT: 'Long wait',
    OTHER: 'Other',
  },
  closeVariance: {
    SHORT_CHANGE: 'Short change given',
    EXPENSE_MISSING: 'Expense not entered',
    COUNT_ERROR: 'Counting error',
    OTHER: 'Other',
  },
  payIn: {
    FLOAT_TOP_UP: 'Float top-up',
    OTHER: 'Other',
  },
  payOut: {
    SUPPLIER: 'Supplier paid',
    STAFF_ADVANCE: 'Staff advance',
    OTHER: 'Other',
  },
  drop: {
    SAFE: 'Moved to safe',
    BANK: 'Taken to bank',
    OTHER: 'Other',
  },
} as const satisfies Record<string, Record<string, string>>;

export type ReasonKind = keyof typeof REASON_LABELS;
export type ReasonCode<K extends ReasonKind> = keyof (typeof REASON_LABELS)[K] & string;

/** The label staff see for a reason code; an unknown code (an older entry) is shown as is. */
export function reasonLabel(kind: ReasonKind, code: string): string {
  const labels: Record<string, string> = REASON_LABELS[kind];
  return labels[code] ?? code;
}

/** The fields a request carries for a reason: a code and note, or the older free text. */
export interface ReasonInput {
  reasonCode?: string | undefined;
  note?: string | undefined;
  /** What a cached older web build still sends; counts as OTHER with this text. */
  reason?: string | undefined;
}

/** A reason as stored: the code, and the text for the existing free-text column. */
export interface ResolvedReason {
  code: string;
  text: string;
}

/**
 * The code to store and the text for the existing free-text column (`note`, else the label),
 * or null when the request gave no reason.
 */
export function resolveReason(kind: ReasonKind, input: ReasonInput): ResolvedReason | null {
  const note = input.note?.trim() ?? '';
  if (input.reasonCode) {
    return { code: input.reasonCode, text: note || reasonLabel(kind, input.reasonCode) };
  }
  const legacy = input.reason?.trim() ?? '';
  return legacy ? { code: 'OTHER', text: legacy } : null;
}

/** Request fields for a reason from `codes`. `reason` is only for older cached web builds. */
export function reasonRequestFields<const C extends readonly [string, ...string[]]>(codes: C) {
  return {
    reasonCode: z.enum(codes).optional(),
    note: z.string().trim().max(200).optional(),
    reason: z.string().trim().max(200).optional(),
  };
}

/**
 * OTHER needs a note of 3 or more characters. With `required`, a code (or the older `reason`
 * text of 3 or more characters) must be present.
 */
export function refineReason<S extends z.ZodType<ReasonInput>>(schema: S, required: boolean) {
  const withNote = schema.refine((v) => v.reasonCode !== 'OTHER' || (v.note?.length ?? 0) >= 3, {
    path: ['note'],
    message: 'Say what happened.',
  });
  return required
    ? withNote.refine((v) => !!v.reasonCode || (v.reason?.length ?? 0) >= 3, {
        path: ['reasonCode'],
        message: 'Choose a reason.',
      })
    : withNote;
}

export const kotReprintSchema = z
  .strictObject({
    reasonCode: z.enum(KOT_REPRINT_REASONS),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.reasonCode !== 'OTHER' || (v.note?.length ?? 0) >= 3, {
    path: ['note'],
    message: 'Say what happened.',
  });
export type KotReprintRequest = z.infer<typeof kotReprintSchema>;
