const RUPEE = 100;

/**
 * Notes a customer is likely to hand over for `due` paise: the next ₹50, ₹100 and ₹500, then
 * ₹500 and ₹2,000. Only amounts above `due`, smallest first, at most three.
 */
export function suggestNotes(due: number): number[] {
  if (due <= 0) return [];
  const nextMultiple = (step: number) => (Math.floor(due / step) + 1) * step;
  const candidates = [
    nextMultiple(50 * RUPEE),
    nextMultiple(100 * RUPEE),
    nextMultiple(500 * RUPEE),
    500 * RUPEE,
    2000 * RUPEE,
  ];
  return [...new Set(candidates.filter((n) => n > due))].sort((a, b) => a - b).slice(0, 3);
}

export type CashOutcome = { change: number } | { short: number };

/** Change to give back, or how much more cash is needed. */
export function cashOutcome(due: number, tendered: number): CashOutcome {
  return tendered >= due ? { change: tendered - due } : { short: due - tendered };
}
