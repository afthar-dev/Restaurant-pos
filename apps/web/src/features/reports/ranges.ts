/** Report dates are India calendar dates (YYYY-MM-DD), whatever the device's time zone. */

const IST_OFFSET_MS = 5.5 * 3600_000;
const DAY_MS = 86_400_000;

export interface DateRange {
  from: string;
  to: string;
}

export type Preset = 'today' | 'yesterday' | 'last7Days' | 'thisWeek' | 'thisMonth' | 'lastMonth';

export const PRESET_LABEL: Record<Preset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7Days: 'Last 7 days',
  thisWeek: 'This week',
  thisMonth: 'This month',
  lastMonth: 'Last month',
};

/** Midnight UTC of the current India date, so date maths never crosses a time zone. */
function istToday(now: number): Date {
  const ist = new Date(now + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The India calendar date of a moment, which is the date reports file a business day under. */
export const istDateOf = (isoTime: string): string =>
  new Date(Date.parse(isoTime) + IST_OFFSET_MS).toISOString().slice(0, 10);

export function presetRange(preset: Preset, now = Date.now()): DateRange {
  const today = istToday(now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'yesterday': {
      const day = new Date(today.getTime() - DAY_MS);
      return { from: iso(day), to: iso(day) };
    }
    case 'last7Days':
      return { from: iso(new Date(today.getTime() - 6 * DAY_MS)), to: iso(today) };
    case 'thisWeek': {
      // Weeks start on Monday.
      const sinceMonday = (today.getUTCDay() + 6) % 7;
      return { from: iso(new Date(today.getTime() - sinceMonday * DAY_MS)), to: iso(today) };
    }
    case 'thisMonth':
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(today) };
    case 'lastMonth':
      return {
        from: iso(new Date(Date.UTC(y, m - 1, 1))),
        to: iso(new Date(Date.UTC(y, m, 0))),
      };
  }
}

/** "7 Oct 2026". */
export function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Every India date from `range.from` to `range.to`, inclusive. */
export function datesInRange(range: DateRange): string[] {
  const dates: string[] = [];
  for (
    let t = Date.parse(`${range.from}T00:00:00Z`);
    t <= Date.parse(`${range.to}T00:00:00Z`);
    t += DAY_MS
  ) {
    dates.push(iso(new Date(t)));
  }
  return dates;
}
