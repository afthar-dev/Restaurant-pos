import { create } from 'zustand';
import { newId } from '@/shared/lib/id';
import type { CartLine } from './types';

/** Most of one dish a diner can order at once. */
export const MAX_QUANTITY = 20;

interface CartState {
  lines: CartLine[];
  /**
   * The Idempotency-Key for sending this cart. Kept after a failed send, so a retry cannot
   * order twice; any change to the cart makes it a different order with a new id.
   */
  requestId: string | null;
  /** Adds a dish; the same dish with the same choices adds to that line. */
  add: (line: CartLine) => void;
  /** Sets a line's quantity; 0 removes it. */
  setQuantity: (key: string, quantity: number) => void;
  /** The id for sending the cart as it is now. */
  takeRequestId: () => string;
  clear: () => void;
}

export const useCart = create<CartState>()((set, get) => ({
  lines: [],
  requestId: null,
  add: (line) =>
    set((state) => {
      const same = state.lines.find((l) => l.key === line.key);
      const lines = same
        ? state.lines.map((l) =>
            l.key === line.key
              ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + line.quantity) }
              : l,
          )
        : [...state.lines, line];
      return { lines, requestId: null };
    }),
  setQuantity: (key, quantity) =>
    set((state) => ({
      lines:
        quantity <= 0
          ? state.lines.filter((l) => l.key !== key)
          : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
      requestId: null,
    })),
  takeRequestId: () => {
    const existing = get().requestId;
    if (existing) return existing;
    const requestId = newId();
    set({ requestId });
    return requestId;
  },
  clear: () => set({ lines: [], requestId: null }),
}));

export const cartTotals = (lines: CartLine[]) => ({
  dishes: lines.reduce((n, l) => n + l.quantity, 0),
  total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
});
