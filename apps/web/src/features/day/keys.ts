export const dayKeys = {
  /** The open business day (or none). */
  current: ['business-day'] as const,
  list: ['days'] as const,
  closeCheck: ['close-check'] as const,
  report: (dayId: string | undefined) => ['day-report', dayId] as const,
};
