import { CalendarCheck, CalendarClock, CalendarX } from 'lucide-react';
import { Link } from 'react-router';
import { useBusinessDay } from '@/features/day';
import { useCan } from '@/shared/session/store';
import { dayAndTime, time } from '@/shared/lib/when';
import { Badge } from '@/shared/ui';

/** No restaurant service runs this long: a day open longer was not closed last night. */
export const STALE_DAY_HOURS = 20;

/**
 * "Day open since 9:02", or "Day not open" with a link for the people who can open it. A day
 * left open from an earlier date says so, in amber, with a link to close it.
 */
export function DayStatusPill() {
  const day = useBusinessDay();
  const canOpen = useCan('day.openClose');
  if (!day.data) return null;
  const open = day.data.day;
  if (open) {
    const stale = Date.now() - Date.parse(open.openedAt) > STALE_DAY_HOURS * 3600_000;
    if (!stale) {
      return (
        <Badge tone="success" icon={<CalendarCheck />} className="px-2.5 py-1 text-sm">
          {`Day open since ${time(open.openedAt)}`}
        </Badge>
      );
    }
    return (
      <span className="inline-flex items-center gap-2">
        <Badge tone="warning" icon={<CalendarClock />} className="px-2.5 py-1 text-sm">
          {`Day open since ${dayAndTime(open.openedAt)}`}
        </Badge>
        {canOpen && (
          <Link to="/day" className="text-sm font-medium text-primary-800 underline">
            Close it
          </Link>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone="warning" icon={<CalendarX />} className="px-2.5 py-1 text-sm">
        Day not open
      </Badge>
      {canOpen && (
        <Link to="/pos" className="text-sm font-medium text-primary-800 underline">
          Open day
        </Link>
      )}
    </span>
  );
}
