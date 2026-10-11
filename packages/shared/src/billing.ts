import { z } from 'zod';
import { gstinSchema } from './gstin';
import { priceSchema } from './menu';
import { DISCOUNT_REASONS, VOID_REASONS, reasonRequestFields, refineReason } from './reasons';

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const BILL_STATUSES = ['OPEN', 'PAID', 'VOID'] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const DISCOUNT_KINDS = ['FLAT', 'PERCENT'] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** FLAT: paise. PERCENT: basis points (1000 = 10%). */
export const discountSchema = z
  .strictObject({
    kind: z.enum(DISCOUNT_KINDS),
    value: z.number().int().min(0).max(10_000_000),
  })
  .refine((d) => d.kind === 'FLAT' || d.value <= 10000, {
    message: 'A discount cannot be more than 100%',
    path: ['value'],
  });
export type Discount = z.infer<typeof discountSchema>;

const reasonSchema = z.string().trim().min(3, 'Give a short reason').max(140);

export const createBillSchema = z.strictObject({
  /** Omit to bill everything not yet billed. */
  lines: z
    .array(z.strictObject({ orderItemId: z.uuid(), quantity: z.number().int().min(1).max(99) }))
    .min(1, 'Choose at least one dish')
    .max(200)
    .optional(),
});
export type CreateBillRequest = z.infer<typeof createBillSchema>;

export const billDiscountSchema = refineReason(
  z.strictObject({
    /** Omit to keep the bill discount, null to remove it. */
    bill: discountSchema.nullable().optional(),
    items: z
      .array(z.strictObject({ billItemId: z.uuid(), discount: discountSchema.nullable() }))
      .max(200)
      .default([]),
    /**
     * A reason is required (checked by the server) whenever any discount is above zero.
     * `reason` is the older free text; it counts as OTHER.
     */
    ...reasonRequestFields(DISCOUNT_REASONS),
  }),
  false,
);
export type BillDiscountRequest = z.infer<typeof billDiscountSchema>;

export const addPaymentSchema = z.strictObject({
  mode: z.enum(PAYMENT_MODES),
  amount: priceSchema.refine((v) => v > 0, 'Enter an amount'),
  /** Cash handed over; change = tendered − amount. Cash only. */
  tendered: priceSchema.optional(),
  /** UPI or card reference, optional. */
  reference: z.string().trim().max(60).optional(),
});
export type AddPaymentRequest = z.infer<typeof addPaymentSchema>;

/** Blank text counts as cleared. Send null (or an empty string) to remove a field. */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const billCustomerSchema = z.strictObject({
  name: z.preprocess(blankToNull, z.string().trim().max(100).nullable()).optional(),
  gstin: z.preprocess(blankToNull, gstinSchema.nullable()).optional(),
});
export type BillCustomerRequest = z.infer<typeof billCustomerSchema>;

export const voidBillSchema = refineReason(z.strictObject(reasonRequestFields(VOID_REASONS)), true);
export type VoidBillRequest = z.infer<typeof voidBillSchema>;

export const moveOrderSchema = z.strictObject({ tableId: z.uuid() });
export type MoveOrderRequest = z.infer<typeof moveOrderSchema>;

export const mergeOrderSchema = z.strictObject({ fromOrderId: z.uuid() });
export type MergeOrderRequest = z.infer<typeof mergeOrderSchema>;

export const closeDaySchema = z.strictObject({
  countedCash: priceSchema,
  note: z.string().trim().max(200).optional(),
});
export type CloseDayRequest = z.infer<typeof closeDaySchema>;

export const reopenDaySchema = z.strictObject({ reason: reasonSchema });
export type ReopenDayRequest = z.infer<typeof reopenDaySchema>;

/** Equal shares of `total` paise for N payers; the first parts carry the spare paise. */
export function splitEqually(total: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts < 2 || parts > 20) {
    throw new Error('Split between 2 and 20 people');
  }
  if (total < parts) throw new Error('The amount is too small to split');
  const base = Math.floor(total / parts);
  const spare = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < spare ? 1 : 0));
}
