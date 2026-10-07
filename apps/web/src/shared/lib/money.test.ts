import { describe, expect, it } from 'vitest';
import { rupees } from './money';

describe('rupees', () => {
  it('groups digits the Indian way and shows paise only when there are some', () => {
    expect(rupees(9000)).toBe('₹90');
    expect(rupees(22050)).toBe('₹220.50');
    expect(rupees(5000000)).toBe('₹50,000');
    expect(rupees(12345650)).toBe('₹1,23,456.50');
    expect(rupees(0)).toBe('₹0');
    expect(rupees(-500)).toBe('-₹5');
    expect(rupees(5)).toBe('₹0.05');
  });
});
