import { gstLinesOf, gstSummary } from './gst-summary';

const item = (cgstBp: number, sgstBp: number, taxable: number) => ({
  cgstBp,
  sgstBp,
  taxable,
  cgst: Math.round((taxable * cgstBp) / 10000),
  sgst: Math.round((taxable * sgstBp) / 10000),
});

describe('gstSummary', () => {
  it('splits taxable value by rate and sets No-GST sales apart', () => {
    const s = gstSummary([item(250, 250, 20000), item(900, 900, 10000), item(0, 0, 10000)]);
    expect(s.taxable).toBe(30000);
    expect(s.exempt).toBe(10000);
    expect(s.rates).toEqual([
      { ratePercent: 5, taxable: 20000, cgst: 500, sgst: 500 },
      { ratePercent: 18, taxable: 10000, cgst: 900, sgst: 900 },
    ]);
  });

  it('merges lines of the same rate and handles an empty list', () => {
    expect(gstSummary([item(250, 250, 100), item(250, 250, 300)]).rates).toHaveLength(1);
    expect(gstSummary([])).toEqual({ taxable: 0, exempt: 0, rates: [] });
  });

  it('counts every line of a non-GST scheme as exempt', () => {
    const lines = gstLinesOf({ taxScheme: 'COMPOSITION', items: [item(250, 250, 5000)] });
    expect(gstSummary(lines)).toMatchObject({ taxable: 0, exempt: 5000, rates: [] });
  });
});
