/** Axis top: the value rounded up to 1, 2, 2.5 or 5 × 10ⁿ, so grid lines fall on round amounts. */
export function niceMax(value: number): number {
  if (value <= 0) return 0;
  const base = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5]) if (step * base >= value) return step * base;
  return 10 * base;
}

const oneDecimal = (n: number) =>
  n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);

/** Short money for axes: ₹850, ₹12k, ₹12.5k, ₹1.2L, ₹2Cr. */
export function shortRupees(paise: number): string {
  const r = paise / 100;
  if (r < 1000) return `₹${Math.round(r)}`;
  if (r < 100_000) return `₹${oneDecimal(r / 1000)}k`;
  if (r < 10_000_000) return `₹${oneDecimal(r / 100_000)}L`;
  return `₹${oneDecimal(r / 10_000_000)}Cr`;
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

export const hourRange = (hour: number) => `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "Sun 11 Oct" for an India date (YYYY-MM-DD). */
export function dayLabel(iso: string): string {
  const d = utc(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Sun 11" for axis labels. */
export function shortDayLabel(iso: string): string {
  const d = utc(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export const billCount = (n: number) => (n === 1 ? '1 bill' : `${n} bills`);
