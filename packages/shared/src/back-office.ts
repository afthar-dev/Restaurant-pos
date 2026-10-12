import { z } from 'zod';
import { PAYMENT_MODES } from './billing';
import { nameSchema } from './schemas';

// Quantities are integer thousandths of the item's unit (1.5 kg = 1500), like money in paise:
// exact, and no floating point in totals.

const MAX_UNITS = 1_000_000;

/** "1.5" → 1500, "0.250" → 250. Null for anything that is not a positive amount of ≤ 3 decimals. */
export function parseQuantity(text: string): number | null {
  const match = /^(\d*)(?:\.(\d{0,3}))?$/.exec(text.trim());
  if (!match || (match[1] === '' && !match[2])) return null;
  const whole = Number(match[1] || '0');
  const fraction = Number((match[2] ?? '').padEnd(3, '0'));
  const milli = whole * 1000 + fraction;
  if (milli <= 0 || whole > MAX_UNITS || (whole === MAX_UNITS && fraction > 0)) return null;
  return milli;
}

/** 1500 → "1.5", 12000 → "12", -500 → "-0.5". */
export function formatQuantity(milli: number): string {
  const sign = milli < 0 ? '-' : '';
  const abs = Math.abs(milli);
  const whole = Math.floor(abs / 1000);
  const fraction = String(abs % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

export const STOCK_UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'pack', 'dozen'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

const milli = z.number().int();
const reasonSchema = z.string().trim().min(3, 'Give a short reason').max(140);
const noteSchema = z.string().trim().max(140, 'Keep the note under 140 characters');
/** Up to ₹1 crore per line or expense. */
const amountSchema = z
  .number()
  .int()
  .min(1, 'Enter an amount')
  .max(1_000_000_000, 'Amount is too large');

export const stockItemSchema = z.strictObject({
  name: nameSchema,
  unit: z.enum(STOCK_UNITS, 'Choose a unit'),
  minLevelMilli: milli.min(0).max(MAX_UNITS * 1000),
});
export type StockItemRequest = z.infer<typeof stockItemSchema>;

export const stockAdjustSchema = z.strictObject({
  qtyMilli: milli
    .min(-MAX_UNITS * 1000)
    .max(MAX_UNITS * 1000)
    .refine((q) => q !== 0, 'Enter how much to add or remove'),
  reason: reasonSchema,
});
export type StockAdjustRequest = z.infer<typeof stockAdjustSchema>;

export const stockCountSchema = z.strictObject({
  countedMilli: milli.min(0).max(MAX_UNITS * 1000),
  note: noteSchema.optional(),
});
export type StockCountRequest = z.infer<typeof stockCountSchema>;

export const purchaseSchema = z.strictObject({
  vendorName: z.string().trim().min(1, 'Enter the vendor').max(80),
  billRef: z.string().trim().max(40).optional(),
  paidMode: z.enum(PAYMENT_MODES),
  note: noteSchema.optional(),
  lines: z
    .array(
      z.strictObject({
        stockItemId: z.uuid(),
        qtyMilli: milli.min(1, 'Enter a quantity').max(MAX_UNITS * 1000),
        amount: amountSchema,
      }),
    )
    .min(1, 'Add at least one item')
    .max(50)
    .refine(
      (lines) => new Set(lines.map((l) => l.stockItemId)).size === lines.length,
      'Each item once per purchase',
    )
    .refine(
      (lines) => lines.reduce((sum, l) => sum + l.amount, 0) <= 1_000_000_000,
      'A purchase can be at most ₹1 crore. Split it into separate bills.',
    ),
});
export type PurchaseRequest = z.infer<typeof purchaseSchema>;

export const expenseCategorySchema = z.strictObject({ name: nameSchema });
export type ExpenseCategoryRequest = z.infer<typeof expenseCategorySchema>;

export const expenseSchema = z.strictObject({
  categoryId: z.uuid('Choose a category'),
  amount: amountSchema,
  mode: z.enum(PAYMENT_MODES),
  note: noteSchema.optional(),
  /** A manager's single-use approval for a cash expense above the petty-cash limit. */
  overrideToken: z.string().min(1).max(2000).optional(),
});
export type ExpenseRequest = z.infer<typeof expenseSchema>;

export const voidSchema = z.strictObject({ reason: reasonSchema });
export type VoidRequest = z.infer<typeof voidSchema>;

export const MAX_REPORT_DAYS = 92;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-07')
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(d);
  }, 'Not a real date');

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

export const reportRangeSchema = z
  .strictObject({ from: isoDate, to: isoDate })
  .refine((r) => dayNumber(r.to) >= dayNumber(r.from), {
    message: 'The end date is before the start date',
    path: ['to'],
  })
  .refine((r) => dayNumber(r.to) - dayNumber(r.from) + 1 <= MAX_REPORT_DAYS, {
    message: `Choose at most ${MAX_REPORT_DAYS} days`,
    path: ['to'],
  });
export type ReportRange = z.infer<typeof reportRangeSchema>;

/** SAC code for restaurant services, shown on the GST report. */
export const RESTAURANT_SAC = '996331';

/** GST report for a range of invoice dates (India time). Money is integer paise. */
export interface GstReport {
  range: { from: string; to: string };
  /** The outlet's tax scheme today; each bill is judged by the scheme it was made under. */
  scheme: 'NONE' | 'REGULAR' | 'COMPOSITION';
  /** Taxable value and GST per rate, from regular bills. */
  b2cByRate: { ratePercent: number; taxable: number; cgst: number; sgst: number; total: number }[];
  /** Sales with no GST: No-GST dishes, and bills made while not registered. */
  exempt: number;
  sac: { code: string; quantity: number; value: number };
  /** Invoice numbers per financial year; cancelled (void) bills are counted but kept out of figures. */
  series: { fy: string; first: number; last: number; count: number; voided: number }[];
  composition: { turnover: number; taxPayable: number } | null;
}
