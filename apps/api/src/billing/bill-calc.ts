/**
 * Bill maths from spec §4.5. Pure and integer-only (paise, basis points) so every amount on a
 * printed bill can be recomputed exactly. Rounding is half-up; nothing here goes negative.
 */
export type TaxScheme = 'REGULAR' | 'COMPOSITION' | 'NONE';

/** FLAT: paise. PERCENT: basis points. */
export interface CalcDiscount {
  kind: 'FLAT' | 'PERCENT';
  value: number;
}

export interface CalcLine {
  /** Per unit, add-ons included. */
  unitPrice: number;
  quantity: number;
  packagingPerUnit: number;
  cgstBp: number;
  sgstBp: number;
  discount: CalcDiscount | null;
}

export interface CalcInput {
  lines: CalcLine[];
  billDiscount: CalcDiscount | null;
  billPackaging: number;
  taxScheme: TaxScheme;
}

export interface CalcLineResult {
  gross: number;
  itemDiscount: number;
  lineTotal: number;
  billDiscountShare: number;
  packaging: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

export interface TaxBreakupRow {
  cgstBp: number;
  sgstBp: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

export interface CalcResult {
  lines: CalcLineResult[];
  grossSubtotal: number;
  itemDiscount: number;
  subtotal: number;
  billDiscount: number;
  packaging: number;
  taxable: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  total: number;
  taxBreakup: TaxBreakupRow[];
}

const bpOf = (amount: number, bp: number) => Math.round((amount * bp) / 10000);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function discountOn(base: number, discount: CalcDiscount | null): number {
  if (!discount) return 0;
  const raw = discount.kind === 'FLAT' ? discount.value : bpOf(base, discount.value);
  return Math.min(base, Math.max(0, raw));
}

/** Splits `amount` in proportion to `weights` (equally when all are 0); the parts add up exactly. */
export function allocate(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const weightSum = sum(weights);
  const basis = weightSum === 0 ? weights.map(() => 1) : weights;
  const total = weightSum === 0 ? weights.length : weightSum;
  const exact = basis.map((w) => (amount * w) / total);
  const parts = exact.map(Math.floor);
  let spare = amount - sum(parts);
  const byRemainder = exact
    .map((e, i) => ({ i, rest: e - parts[i]! }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of byRemainder) {
    if (spare === 0) break;
    parts[i]! += 1;
    spare -= 1;
  }
  return parts;
}

export function calculateBill(input: CalcInput): CalcResult {
  if (input.lines.length === 0) throw new Error('A bill needs at least one line');
  const base = input.lines.map((l) => {
    const gross = l.unitPrice * l.quantity;
    const itemDiscount = discountOn(gross, l.discount);
    return {
      gross,
      itemDiscount,
      lineTotal: gross - itemDiscount,
      ownPackaging: l.packagingPerUnit * l.quantity,
    };
  });
  const grossSubtotal = sum(base.map((b) => b.gross));
  const itemDiscount = sum(base.map((b) => b.itemDiscount));
  const subtotal = sum(base.map((b) => b.lineTotal));
  const billDiscount = discountOn(subtotal, input.billDiscount);
  const weights = base.map((b) => b.lineTotal);
  const discountShares = allocate(billDiscount, weights);
  const packagingShares = allocate(input.billPackaging, weights);
  const taxed = input.taxScheme === 'REGULAR';

  const lines: CalcLineResult[] = base.map((b, i) => {
    const source = input.lines[i]!;
    const packaging = b.ownPackaging + packagingShares[i]!;
    const taxable = b.lineTotal - discountShares[i]! + packaging;
    return {
      gross: b.gross,
      itemDiscount: b.itemDiscount,
      lineTotal: b.lineTotal,
      billDiscountShare: discountShares[i]!,
      packaging,
      taxable,
      cgst: taxed ? bpOf(taxable, source.cgstBp) : 0,
      sgst: taxed ? bpOf(taxable, source.sgstBp) : 0,
    };
  });

  const taxable = sum(lines.map((l) => l.taxable));
  const cgst = sum(lines.map((l) => l.cgst));
  const sgst = sum(lines.map((l) => l.sgst));
  const raw = taxable + cgst + sgst;
  const total = Math.round(raw / 100) * 100;

  const groups = new Map<string, TaxBreakupRow>();
  if (taxed) {
    lines.forEach((l, i) => {
      const { cgstBp, sgstBp } = input.lines[i]!;
      // No-GST dishes carry no tax, so they get no "GST 0%" row in the footer.
      if (cgstBp + sgstBp === 0) return;
      const key = `${cgstBp}/${sgstBp}`;
      const row = groups.get(key) ?? { cgstBp, sgstBp, taxable: 0, cgst: 0, sgst: 0 };
      row.taxable += l.taxable;
      row.cgst += l.cgst;
      row.sgst += l.sgst;
      groups.set(key, row);
    });
  }
  const taxBreakup = [...groups.values()].sort(
    (a, b) => a.cgstBp + a.sgstBp - (b.cgstBp + b.sgstBp),
  );

  return {
    lines,
    grossSubtotal,
    itemDiscount,
    subtotal,
    billDiscount,
    packaging: sum(lines.map((l) => l.packaging)),
    taxable,
    cgst,
    sgst,
    roundOff: total - raw,
    total,
    taxBreakup,
  };
}
