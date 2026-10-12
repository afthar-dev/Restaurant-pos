import { COMPOSITION_RESTAURANT_RATE_BP } from '@rpos/shared';

/** One stored line (bill item) as the GST summary reads it. */
export interface GstLine {
  cgstBp: number;
  sgstBp: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

export interface GstRate {
  /** CGST + SGST rate in percent, e.g. 5 for 2.5% + 2.5%. */
  ratePercent: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

export interface GstSummary {
  /** Sales that carry GST. */
  taxable: number;
  /** Sales with no GST: No-GST dishes, and every line of a bill under a scheme that charges none. */
  exempt: number;
  /** Per rate, lowest first; no row for No-GST sales. */
  rates: GstRate[];
}

/**
 * Taxable value and GST per rate from stored bill lines, so old and new bills add up the same
 * way. Lines of a bill that charged no tax must be passed with both rates as 0.
 */
export function gstSummary(lines: GstLine[]): GstSummary {
  const rates = new Map<number, GstRate>();
  let exempt = 0;
  for (const l of lines) {
    const bp = l.cgstBp + l.sgstBp;
    if (bp === 0) {
      exempt += l.taxable;
      continue;
    }
    const row = rates.get(bp) ?? { ratePercent: bp / 100, taxable: 0, cgst: 0, sgst: 0 };
    row.taxable += l.taxable;
    row.cgst += l.cgst;
    row.sgst += l.sgst;
    rates.set(bp, row);
  }
  const sorted = [...rates.values()].sort((a, b) => a.ratePercent - b.ratePercent);
  return {
    taxable: sorted.reduce((n, r) => n + r.taxable, 0),
    exempt,
    rates: sorted,
  };
}

/** A bill's lines for `gstSummary`: a scheme that charges no GST has no taxed lines. */
export function gstLinesOf(bill: { taxScheme: string; items: GstLine[] }): GstLine[] {
  return bill.taxScheme === 'REGULAR'
    ? bill.items
    : bill.items.map((i) => ({ ...i, cgstBp: 0, sgstBp: 0 }));
}

/** What a composition outlet owes on its turnover: the flat restaurant rate, rounded to paise. */
export function compositionFigures(turnover: number): { turnover: number; taxPayable: number } {
  return { turnover, taxPayable: Math.round((turnover * COMPOSITION_RESTAURANT_RATE_BP) / 10000) };
}
