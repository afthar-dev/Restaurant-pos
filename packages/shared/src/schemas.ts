import { z } from 'zod';
import { PASSWORD_ROLES, PERMISSIONS, ROLES } from './auth';
import { gstinSchema } from './gstin';

export const TAX_SCHEMES = ['REGULAR', 'COMPOSITION', 'NONE'] as const;
export type TaxScheme = (typeof TAX_SCHEMES)[number];

export const DEVICE_TYPES = ['POS', 'CAPTAIN', 'KDS', 'PRINT_AGENT'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const PARCEL_PAYMENT_TIMINGS = ['PAY_FIRST', 'PAY_AT_PICKUP'] as const;
export type ParcelPaymentTiming = (typeof PARCEL_PAYMENT_TIMINGS)[number];

/** Indian mobile number: 10 digits starting 6–9, no country code or spaces. */
export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');

export const pinSchema = z.string().regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

export const nameSchema = z.string().trim().min(1, 'Name is required').max(100, 'Name is too long');

export const loginSchema = z.strictObject({
  phone: phoneSchema,
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginRequest = z.infer<typeof loginSchema>;

export const pinLoginSchema = z.strictObject({
  userId: z.uuid(),
  pin: pinSchema,
});
export type PinLoginRequest = z.infer<typeof pinLoginSchema>;

export const overrideSchema = z.strictObject({
  userId: z.uuid(),
  pin: pinSchema,
  permission: z.enum(PERMISSIONS),
});
export type OverrideRequest = z.infer<typeof overrideSchema>;

const isPasswordRole = (role: (typeof ROLES)[number]) => PASSWORD_ROLES.includes(role);

export const createUserSchema = z
  .strictObject({
    name: nameSchema,
    phone: phoneSchema,
    role: z.enum(ROLES),
    password: passwordSchema.optional(),
    pin: pinSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (isPasswordRole(value.role) && !value.password) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Owners and managers need a password',
      });
    }
    if (!isPasswordRole(value.role)) {
      if (!value.pin) {
        ctx.addIssue({ code: 'custom', path: ['pin'], message: 'Cashiers and waiters need a PIN' });
      }
      if (value.password) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: 'Only owners and managers sign in with a password',
        });
      }
    }
  });
export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.strictObject({
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
  role: z.enum(ROLES).optional(),
  password: passwordSchema.nullable().optional(),
  pin: pinSchema.nullable().optional(),
});
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const outletSettingsSchema = z.strictObject({
  name: nameSchema.optional(),
  gstin: gstinSchema.nullable().optional(),
  taxScheme: z.enum(TAX_SCHEMES).optional(),
  address: optionalText(300),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, 'Enter a valid phone number')
    .nullable()
    .optional(),
  fssaiNumber: z
    .string()
    .regex(/^\d{14}$/, 'FSSAI licence number is 14 digits')
    .nullable()
    .optional(),
  billHeader: optionalText(500),
  billFooter: optionalText(500),
  cashierDiscountCapBp: z.number().int().min(0).max(10000).optional(),
  waiterCanCollectPayment: z.boolean().optional(),
  parcelPaymentTiming: z.enum(PARCEL_PAYMENT_TIMINGS).optional(),
  /** Paise added once to each parcel order's bill (bag, cutlery). */
  billPackagingCharge: z.number().int().min(0).max(100_000).optional(),
  /** Cash variance (paise) above which closing the day needs a reason. */
  varianceAlertPaise: z.number().int().min(0).max(10_000_000).optional(),
});
export type OutletSettingsUpdate = z.infer<typeof outletSettingsSchema>;

export const registerDeviceSchema = z.strictObject({
  name: nameSchema,
  type: z.enum(DEVICE_TYPES),
});
export type RegisterDeviceRequest = z.infer<typeof registerDeviceSchema>;
