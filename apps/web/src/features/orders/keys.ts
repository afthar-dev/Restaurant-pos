/**
 * Query keys for orders and the floor. Realtime notices and mutations invalidate through
 * these, so a key is never retyped by hand.
 */
export const floorKeys = {
  all: ['floor'] as const,
  status: () => ['floor', 'status'] as const,
};

export const orderKeys = {
  active: () => ['orders', 'active'] as const,
  detail: (orderId: string | null) => ['order', orderId] as const,
  /** Every bill of one order (the billing screens read and refresh these). */
  bills: (orderId: string) => ['bills', orderId] as const,
};

export const qrKeys = {
  pending: () => ['qr-pending'] as const,
};
