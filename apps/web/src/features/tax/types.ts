export interface TaxRate {
  id: string;
  name: string;
  cgstBp: number;
  sgstBp: number;
  totalBp: number;
  archivedAt: string | null;
}

/** 250 → "2.5%", 900 → "9%". */
export function percent(bp: number): string {
  return `${(bp / 100).toString()}%`;
}
