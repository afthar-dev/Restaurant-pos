import { z } from 'zod';
import { orderLineSchema } from './orders';

export const QR_SUBMISSION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type QrSubmissionStatus = (typeof QR_SUBMISSION_STATUSES)[number];

/** The code printed in the table's QR sticker. */
export const qrStartSchema = z.strictObject({ code: z.string().trim().min(20).max(100) });
export type QrStartRequest = z.infer<typeof qrStartSchema>;

const linesSchema = z.array(orderLineSchema).min(1, 'Add at least one dish').max(30);

export const qrSubmitSchema = z.strictObject({
  lines: linesSchema,
  note: z.string().trim().max(140).optional(),
});
export type QrSubmitRequest = z.infer<typeof qrSubmitSchema>;

/** Omit `lines` to approve what the customer sent; send them to approve an edited order. */
export const qrApproveSchema = z.strictObject({ lines: linesSchema.optional() });
export type QrApproveRequest = z.infer<typeof qrApproveSchema>;

export const qrRejectSchema = z.strictObject({ reason: z.string().trim().max(140).optional() });
export type QrRejectRequest = z.infer<typeof qrRejectSchema>;
