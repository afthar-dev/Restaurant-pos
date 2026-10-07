import type { OrderLine } from '../../types';

/** "Large, Extra cheese" — the size (unless Regular) and the add-ons of a line. */
export function lineDetail(line: OrderLine): string {
  const parts = [
    line.variantName !== 'Regular' ? line.variantName : '',
    ...line.addons.map((a) => a.name),
  ];
  return parts.filter(Boolean).join(', ');
}
