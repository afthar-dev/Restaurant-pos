import type { QrSubmission } from '@prisma/client';

/** One dish as the customer asked for it (snapshot taken at submit time). */
export interface QrLine {
  variantId: string;
  quantity: number;
  addonIds: string[];
  note?: string;
  itemName: string;
  variantName: string;
  addons: string[];
  /** Dine-in price per unit, add-ons included. */
  unitPrice: number;
}

const MESSAGE = {
  PENDING: 'Waiting for the staff to confirm',
  APPROVED: 'Accepted and sent to the kitchen',
  REJECTED: 'Not accepted. Please ask your waiter.',
} as const;

/** What the customer's phone shows for one submission. */
export function submissionView(s: QrSubmission) {
  return {
    id: s.id,
    status: s.status,
    message: MESSAGE[s.status],
    lines: (s.lines as unknown as QrLine[]).map((l) => ({
      itemName: l.itemName,
      variantName: l.variantName,
      addons: l.addons,
      quantity: l.quantity,
      note: l.note ?? null,
      amount: l.unitPrice * l.quantity,
    })),
    note: s.note,
    total: s.total,
    createdAt: s.createdAt,
  };
}

export type QrSubmissionView = ReturnType<typeof submissionView>;

/**
 * What staff see for a request waiting for approval (with ids, so they can edit it). `blocked`
 * says when it cannot be approved: its order already has a printed bill.
 */
export function pendingView(s: QrSubmission & { table?: { name: string } }, orderStatus?: string) {
  return {
    id: s.id,
    orderId: s.orderId,
    tableName: s.table?.name ?? null,
    createdAt: s.createdAt,
    lines: (s.lines as unknown as QrLine[]).map((l) => ({
      variantId: l.variantId,
      addonIds: l.addonIds,
      quantity: l.quantity,
      note: l.note ?? null,
      itemName: l.itemName,
      variantName: l.variantName,
      addons: l.addons,
      amount: l.unitPrice * l.quantity,
    })),
    note: s.note,
    total: s.total,
    blocked: orderStatus === 'BILLED' ? ('BILL_PRINTED' as const) : null,
  };
}

export type QrPendingView = ReturnType<typeof pendingView>;
