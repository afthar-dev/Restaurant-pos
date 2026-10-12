import { z } from 'zod';

/** A UPI ID (VPA): `name@bank`. */
const VPA_FORMAT = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export const vpaSchema = z.string().trim().regex(VPA_FORMAT, 'Enter a UPI ID like name@bank');

export interface UpiLinkInput {
  vpa: string;
  payee: string;
  amountPaise: number;
  note?: string | undefined;
}

/**
 * The `upi://pay` link a customer's UPI app opens. Encoding: every value goes through
 * `encodeURIComponent` (a space is `%20`), except the `@` in the UPI ID, which stays literal because
 * many UPI apps do not decode `%40`; the amount is rupees with two
 * decimals; the currency is always INR. The note is left out when empty.
 */
export function upiLink({ vpa, payee, amountPaise, note }: UpiLinkInput): string {
  const rupees = `${Math.floor(amountPaise / 100)}.${String(amountPaise % 100).padStart(2, '0')}`;
  const parts = [
    `pa=${encodeURIComponent(vpa).replace(/%40/g, '@')}`,
    `pn=${encodeURIComponent(payee)}`,
    `am=${rupees}`,
    'cu=INR',
  ];
  if (note) parts.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${parts.join('&')}`;
}
