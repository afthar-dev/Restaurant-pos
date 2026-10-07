import { describe, expect, it } from 'vitest';
import { cartTotals, MAX_QUANTITY, useCart } from './store';
import type { CartLine } from './types';

const roti = (quantity = 1): CartLine => ({
  key: 'roti|',
  variantId: 'roti',
  addonIds: [],
  quantity,
  label: 'Tandoori Roti',
  unitPrice: 2500,
});

describe('cart store', () => {
  it('adds the same dish with the same choices to one line, up to the limit', () => {
    const { add } = useCart.getState();
    add(roti(2));
    add(roti(3));
    expect(useCart.getState().lines).toEqual([roti(5)]);
    add(roti(MAX_QUANTITY));
    expect(useCart.getState().lines[0]?.quantity).toBe(MAX_QUANTITY);
  });

  it('removes a line set to zero and totals the rest', () => {
    const { add, setQuantity } = useCart.getState();
    add(roti(2));
    add({ ...roti(1), key: 'naan|', variantId: 'naan', label: 'Butter Naan', unitPrice: 6000 });
    setQuantity('roti|', 0);
    expect(cartTotals(useCart.getState().lines)).toEqual({ dishes: 1, total: 6000 });
  });

  it('keeps one request id until the cart changes or is cleared', () => {
    const cart = useCart.getState();
    cart.add(roti());
    const first = cart.takeRequestId();
    expect(useCart.getState().takeRequestId()).toBe(first);
    useCart.getState().setQuantity('roti|', 2);
    const second = useCart.getState().takeRequestId();
    expect(second).not.toBe(first);
    useCart.getState().clear();
    expect(useCart.getState().requestId).toBeNull();
    expect(useCart.getState().lines).toEqual([]);
  });
});
