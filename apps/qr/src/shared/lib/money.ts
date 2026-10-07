/** ₹420, or ₹33.50 when there are paise. */
export function rupees(paise: number): string {
  const whole = Math.floor(paise / 100);
  const rest = paise % 100;
  const grouped = whole.toLocaleString('en-IN');
  return rest === 0 ? `₹${grouped}` : `₹${grouped}.${String(rest).padStart(2, '0')}`;
}
