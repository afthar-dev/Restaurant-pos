import { CalendarCheck, CalendarX } from 'lucide-react';
import { Link } from 'react-router';
import { useBusinessDay } from '@/features/day';
import { useCan } from '@/shared/session/store';
import { Badge } from '@/shared/ui';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** "Day open since 9:02", or "Day not open" with a link for the people who can open it. */
export function DayStatusPill() {
  const day = useBusinessDay();
  const canOpen = useCan('day.openClose');
  if (!day.data) return null;
  const open = day.data.day;
  if (open) {
    return (
      <Badge tone="success" icon={<CalendarCheck />} className="px-2.5 py-1 text-sm">
        {`Day open since ${time(open.openedAt)}`}
      </Badge>
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
