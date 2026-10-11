import { z } from 'zod';
import { priceSchema } from './menu';
import { CANCEL_REASONS, reasonRequestFields, refineReason } from './reasons';

export const ORDER_TYPES = ['DINE_IN', 'PARCEL'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_SOURCES = ['POS', 'CAPTAIN', 'QR'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_STATUSES = [
  'PENDING_APPROVAL',
  'OPEN',
  'BILLED',
  'CLOSED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_ITEM_STATUSES = ['NEW', 'SENT', 'CANCELLED'] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

export const KOT_TYPES = ['NEW', 'CANCEL'] as const;
export type KotType = (typeof KOT_TYPES)[number];

export const KOT_STATUSES = ['NEW', 'PREPARING', 'READY', 'SERVED'] as const;
export type KotStatus = (typeof KOT_STATUSES)[number];

export const openDaySchema = z.strictObject({ openingCash: priceSchema });
export type OpenDayRequest = z.infer<typeof openDaySchema>;

export const createOrderSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('DINE_IN'),
    tableId: z.uuid(),
    guests: z.number().int().min(1).max(50),
  }),
  z.strictObject({
    type: z.literal('PARCEL'),
    customerName: z.string().trim().min(1).max(60).optional(),
  }),
]);
export type CreateOrderRequest = z.infer<typeof createOrderSchema>;

const noteSchema = z.string().trim().max(140, 'Keep the note under 140 characters');

export const orderLineSchema = z.strictObject({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(99),
  addonIds: z
    .array(z.uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'Each add-on can be picked once'),
  note: noteSchema.optional(),
});
export type OrderLineRequest = z.infer<typeof orderLineSchema>;

export const addItemsSchema = z.strictObject({
  items: z.array(orderLineSchema).min(1, 'Add at least one item').max(50),
});
export type AddItemsRequest = z.infer<typeof addItemsSchema>;

export const updateOrderItemSchema = z
  .strictObject({
    quantity: z.number().int().min(1).max(99).optional(),
    note: noteSchema.nullable().optional(),
  })
  .refine((v) => v.quantity !== undefined || v.note !== undefined, 'Nothing to change');
export type UpdateOrderItemRequest = z.infer<typeof updateOrderItemSchema>;

export const cancelItemSchema = refineReason(
  z.strictObject({
    ...reasonRequestFields(CANCEL_REASONS),
    quantity: z.number().int().min(1).max(99).optional(),
  }),
  true,
);
export type CancelItemRequest = z.infer<typeof cancelItemSchema>;

export const cancelOrderSchema = refineReason(
  z.strictObject(reasonRequestFields(CANCEL_REASONS)),
  true,
);
export type CancelOrderRequest = z.infer<typeof cancelOrderSchema>;

export const kdsStatusSchema = z.strictObject({
  status: z.enum(['PREPARING', 'READY', 'SERVED']),
});
export type KdsStatusRequest = z.infer<typeof kdsStatusSchema>;

/** Price of one order line in paise: (unit price + add-ons) × quantity. */
export function lineTotal(line: {
  unitPrice: number;
  addons: readonly { price: number }[];
  quantity: number;
}): number {
  const addons = line.addons.reduce((sum, a) => sum + a.price, 0);
  return (line.unitPrice + addons) * line.quantity;
}
