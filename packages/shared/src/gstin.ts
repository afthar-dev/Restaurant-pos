import { z } from 'zod';

const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Restaurant services under the composition scheme pay 5% of turnover, in basis points. */
export const COMPOSITION_RESTAURANT_RATE_BP = 500;

/** Format and state code (01-38) only. The checksum is deliberately not checked. */
export function isValidGstin(value: string): boolean {
  if (!GSTIN_FORMAT.test(value)) return false;
  const state = Number(value.slice(0, 2));
  return state >= 1 && state <= 38;
}

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidGstin, 'Enter a valid 15-character GSTIN');
