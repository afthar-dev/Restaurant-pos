import { CloudOff, Loader, Wifi, WifiOff } from 'lucide-react';
import { Badge, type Tone } from '@/shared/ui';
import { useRealtimeStatus } from '@/shared/realtime/context';
import { useServerHealth } from '../queries';

function Pill({ tone, label, icon }: { tone: Tone; label: string; icon: React.ReactNode }) {
  return (
    <span role="status">
      <Badge tone={tone} icon={icon} className="px-2.5 py-1 text-sm">
        {label}
      </Badge>
    </span>
  );
}

/** Whether this screen can reach the server, and whether live updates are flowing. */
export function ServerStatus() {
  const live = useRealtimeStatus();
  const { data, isPending, isError } = useServerHealth();

  if (isPending) return <Pill tone="neutral" icon={<Loader />} label="Checking server…" />;
  if (isError) {
    return (
      <Pill
        tone="danger"
        icon={<CloudOff />}
        label="Server offline. Check the internet connection."
      />
    );
  }
  if (data.db === 'down')
    return <Pill tone="danger" icon={<CloudOff />} label="Database unavailable" />;
  // Screens still poll every 15 s, but staff should know updates may lag.
  if (live === 'disconnected') {
    return <Pill tone="warning" icon={<WifiOff />} label="Online · live updates paused" />;
  }
  return <Pill tone="success" icon={<Wifi />} label="Server online" />;
}
