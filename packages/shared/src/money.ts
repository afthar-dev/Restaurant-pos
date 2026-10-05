/** Money is stored as integer paise (1 rupee = 100 paise). */
export type Paise = number;

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) {
    throw new RangeError(`Invalid rupee amount: ${rupees}`);
  }
  // Round half away from zero so -12.345 and 12.345 mirror each other; `+ 0` turns -0 into 0.
  return Math.sign(rupees) * Math.round(Math.abs(rupees) * 100) + 0;
}

export function formatPaise(paise: Paise): string {
  if (!Number.isSafeInteger(paise)) {
    throw new RangeError(`Paise must be a safe integer: ${paise}`);
  }
  return inr.format(paise / 100);
}
