/** How long a ticket has waited: "7 min", "1 h 5 min", "1 d 14 h". */
export function ageLabel(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

/** A ticket still not ready after this long is flagged late. */
export const LATE_MINUTES = 20;
