import { paiseToRupeesInput } from '@rpos/shared';

/** Short price for lists: 9000 → "₹90", 22050 → "₹220.50". */
export function rupees(paise: number): string {
  return `₹${paiseToRupeesInput(paise)}`;
}
