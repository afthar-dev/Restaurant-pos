import {
  CalendarClock,
  CalendarX,
  ChevronDown,
  CircleCheck,
  CloudOff,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState } from 'react';
import { useBusinessDay } from '@/features/day';
import { ServerStatus, useServerHealth } from '@/features/health';
import { cn } from '@/shared/lib/cn';
import { useRealtimeStatus } from '@/shared/realtime/context';
import { DayStatusPill, STALE_DAY_HOURS } from './DayStatusPill';

type Level = 'ok' | 'warning' | 'danger';

const DOT: Record<Level, string> = {
  ok: 'bg-green-600',
  warning: 'bg-amber-500',
  danger: 'bg-red-600',
};

/** The one thing the phone header should say, worst first. */
function useOverall(): { level: Level; label: string; icon: LucideIcon } {
  const health = useServerHealth();
  const live = useRealtimeStatus();
  const day = useBusinessDay();
  if (health.isError) return { level: 'danger', label: 'Offline', icon: CloudOff };
  if (health.data?.db === 'down')
    return { level: 'danger', label: 'Database down', icon: CloudOff };
  if (day.data && !day.data.day)
    return { level: 'warning', label: 'Day not open', icon: CalendarX };
  const open = day.data?.day;
  if (open && Date.now() - Date.parse(open.openedAt) > STALE_DAY_HOURS * 3600_000) {
    return { level: 'warning', label: 'Old day open', icon: CalendarClock };
  }
  if (live === 'disconnected') return { level: 'warning', label: 'Updates paused', icon: WifiOff };
  return { level: 'ok', label: 'All good', icon: CircleCheck };
}

/**
 * Phone header status: one 44 px button naming the most important state, which opens the full
 * server and day lines (with their links) under the header.
 */
export function StatusButton() {
  const panel = useId();
  const [open, setOpen] = useState(false);
  const { level, label, icon: Icon } = useOverall();
  return (
    <>
      <button
        type="button"
        aria-label={`Status: ${label}`}
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3 text-sm font-medium text-text"
      >
        <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[level])} />
        <Icon aria-hidden="true" className="size-4 text-muted" />
        <span className={level === 'ok' ? 'sr-only sm:not-sr-only' : undefined}>{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      <div
        id={panel}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border bg-surface px-4 py-3 shadow-overlay"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ServerStatus />
          <DayStatusPill />
        </div>
      </div>
    </>
  );
}
