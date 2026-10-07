import { useServerHealth } from '../queries';
import { useRealtimeStatus } from '@/shared/realtime/context';

type Tone = 'muted' | 'good' | 'bad';

const toneClasses: Record<Tone, string> = {
  muted: 'bg-slate-100 text-slate-600',
  good: 'bg-emerald-50 text-emerald-800',
  bad: 'bg-red-50 text-red-800',
};

const dotClasses: Record<Tone, string> = {
  muted: 'bg-slate-400',
  good: 'bg-emerald-600',
  bad: 'bg-red-600',
};

function Pill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${toneClasses[tone]}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClasses[tone]}`} />
      {label}
    </span>
  );
}

export function ServerStatus() {
  const live = useRealtimeStatus();
  const { data, isPending, isError } = useServerHealth();

  if (isPending) return <Pill tone="muted" label="Checking server…" />;
  if (isError) return <Pill tone="bad" label="Server offline. Check the internet connection." />;
  if (data.db === 'down') return <Pill tone="bad" label="Database unavailable" />;
  // Screens still poll every 15 s, but staff should know updates may lag.
  if (live === 'disconnected') return <Pill tone="muted" label="Online · live updates paused" />;
  return <Pill tone="good" label="Server online" />;
}
