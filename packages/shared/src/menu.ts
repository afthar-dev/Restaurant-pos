import { z } from 'zod';
import type { Paise } from './money';
import { nameSchema } from './schemas';

/** Highest price accepted anywhere: ₹10,00,000. */
export const MAX_PRICE_PAISE = 100_000_000;

/**
 * Reads a rupee amount typed by a person ("120", "120.5", "₹1,200.75") into paise without
 * floating point. Returns null for anything else (negative, more than 2 decimals, too big).
 */
export function parseRupees(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise <= MAX_PRICE_PAISE ? paise : null;
}

/** Formats paise for an input box: 12000 → "120", 12050 → "120.50". */
export function paiseToRupeesInput(paise: Paise): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`;
}

export const FOOD_TYPES = ['VEG', 'NON_VEG', 'EGG'] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

export const PRINTER_PURPOSES = ['KOT', 'BILL'] as const;
export type PrinterPurpose = (typeof PRINTER_PURPOSES)[number];

export const PRINTER_MODES = ['BROWSER', 'AGENT'] as const;
export type PrinterMode = (typeof PRINTER_MODES)[number];

export const PAPER_WIDTHS = [58, 80] as const;

export const priceSchema = z
  .number()
  .int('Price must be in whole paise')
  .min(0, 'Price cannot be negative')
  .max(MAX_PRICE_PAISE, 'Price is too high');

export const sortOrderSchema = z.number().int().min(0).max(10_000);

export const taxRateSchema = z.strictObject({
  name: nameSchema,
  /** Total GST in basis points, split equally into CGST and SGST. */
  totalBp: z
    .number()
    .int()
    .min(0)
    .max(2800, 'GST cannot exceed 28%')
    .refine((bp) => bp % 2 === 0, 'The rate must split evenly into CGST and SGST'),
});
export type TaxRateRequest = z.infer<typeof taxRateSchema>;

export const stationSchema = z.strictObject({ name: nameSchema });
export type StationRequest = z.infer<typeof stationSchema>;

export const printerSchema = z
  .strictObject({
    name: nameSchema,
    purpose: z.enum(PRINTER_PURPOSES),
    stationId: z.uuid().nullable().optional(),
    mode: z.enum(PRINTER_MODES),
    paperWidthMm: z.union([z.literal(58), z.literal(80)]),
    address: z.string().trim().max(200).nullable().optional(),
    /** The registered device (counter PC, kitchen screen or print agent) that prints this. */
    deviceId: z.uuid().nullable().optional(),
  })
  .superRefine((p, ctx) => {
    if (p.purpose === 'KOT' && !p.stationId) {
      ctx.addIssue({ code: 'custom', path: ['stationId'], message: 'Choose the kitchen station' });
    }
    if (p.mode === 'AGENT' && !p.address) {
      ctx.addIssue({
        code: 'custom',
        path: ['address'],
        message: 'Enter the printer network address',
      });
    }
  });
export type PrinterRequest = z.infer<typeof printerSchema>;

export const areaSchema = z.strictObject({
  name: nameSchema,
  sortOrder: sortOrderSchema.optional(),
});
export type AreaRequest = z.infer<typeof areaSchema>;

export const tableSchema = z.strictObject({
  areaId: z.uuid(),
  name: z.string().trim().min(1, 'Name is required').max(20, 'Keep table names short'),
  seats: z.number().int().min(1).max(50),
});
export type TableRequest = z.infer<typeof tableSchema>;

export const categorySchema = z.strictObject({
  name: nameSchema,
  stationId: z.uuid(),
  sortOrder: sortOrderSchema.optional(),
});
export type CategoryRequest = z.infer<typeof categorySchema>;

export const variantInputSchema = z.strictObject({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Name is required').max(40),
  dineInPrice: priceSchema,
  /** Defaults to the dine-in price. */
  parcelPrice: priceSchema.optional(),
  packagingCharge: priceSchema.optional(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const comboComponentSchema = z.strictObject({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(20),
});

export const itemSchema = z
  .strictObject({
    categoryId: z.uuid(),
    name: nameSchema,
    description: z.string().trim().max(300).nullable().optional(),
    foodType: z.enum(FOOD_TYPES),
    taxRateId: z.uuid(),
    variants: z.array(variantInputSchema).min(1, 'Add at least one size or price').max(10),
    addonGroupIds: z.array(z.uuid()).max(10),
    isCombo: z.boolean(),
    components: z.array(comboComponentSchema).max(20),
  })
  .superRefine((item, ctx) => {
    const seen = new Set<string>();
    item.variants.forEach((v, i) => {
      const key = v.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'name'],
          message: 'Names must differ',
        });
      }
      seen.add(key);
    });
    if (item.isCombo && item.components.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Add the items in this combo',
      });
    }
    if (!item.isCombo && item.components.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Only combos have components',
      });
    }
  });
export type ItemRequest = z.infer<typeof itemSchema>;

export const addonGroupSchema = z
  .strictObject({
    name: nameSchema,
    minSelect: z.number().int().min(0).max(30),
    maxSelect: z.number().int().min(1).max(30),
    addons: z
      .array(
        z.strictObject({
          id: z.uuid().optional(),
          name: z.string().trim().min(1, 'Name is required').max(60),
          price: priceSchema,
        }),
      )
      .min(1, 'Add at least one option')
      .max(30),
  })
  .superRefine((g, ctx) => {
    if (g.minSelect > g.maxSelect) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelect'],
        message: 'Minimum cannot be more than maximum',
      });
    }
    if (g.maxSelect > g.addons.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSelect'],
        message: 'Maximum cannot be more than the number of options',
      });
    }
  });
export type AddonGroupRequest = z.infer<typeof addonGroupSchema>;

export const availabilitySchema = z.strictObject({ isAvailable: z.boolean() });
