/**
 * Money for people to read, with Indian digit grouping:
 * 9000 → "₹90", 22050 → "₹220.50", 12340000 → "₹1,23,400", -500 → "-₹5".
 */
export function rupees(paise: number): string {
  if (!Number.isFinite(paise)) return '₹—';
  const abs = Math.round(Math.abs(paise));
  const sign = paise < 0 && abs > 0 ? '-' : '';
  const whole = Math.floor(abs / 100).toLocaleString('en-IN');
  const rest = abs % 100;
  return `${sign}₹${whole}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}
