export const stockKeys = {
  /** Prefix of everything on the stock screens. */
  all: ['stock'] as const,
  items: ['stock', 'items'] as const,
  txns: (itemId: string) => ['stock', 'txns', itemId] as const,
  purchases: (day: string) => ['stock', 'purchases', day] as const,
};
