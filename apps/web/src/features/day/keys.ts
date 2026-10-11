export const dayKeys = {
  /** The open business day (or none). */
  current: ['business-day'] as const,
  list: ['days'] as const,
  closeCheck: ['close-check'] as const,
  /** The closing screen's check, without the expected cash (under the same prefix). */
  closeCheckBlind: ['close-check', 'blind'] as const,
  /** Every day report, for invalidating them all. */
  reports: ['day-report'] as const,
  report: (dayId: string | undefined) => ['day-report', dayId] as const,
};
