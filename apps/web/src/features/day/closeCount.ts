import { CLOSE_NOTE_DENOMINATIONS, reasonLabel, type CloseCount } from '@rpos/shared';

/** The lines of a day's note count: each note counted (₹500 × 3 = 1,50,000 paise), then coins. */
export function countRows(count: CloseCount): { label: string; amount: number }[] {
  const rows = CLOSE_NOTE_DENOMINATIONS.filter((d) => count.notes[d] > 0).map((d) => ({
    label: `₹${d} × ${count.notes[d]}`,
    amount: Number(d) * count.notes[d] * 100,
  }));
  if (count.coins > 0) rows.push({ label: 'Coins', amount: count.coins });
  return rows;
}

/** The label for why the cash was out, or null when no reason was given. */
export const varianceReasonLabel = (code: string | null) =>
  code ? reasonLabel('closeVariance', code) : null;
