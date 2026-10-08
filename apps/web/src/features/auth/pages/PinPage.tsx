import { Delete, KeyRound, MonitorX, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, LoadingScreen } from '@/shared/ui';
import type { StaffOption } from '../api';
import { AuthCard, AuthError } from '../components/AuthCard';
import { usePinSignIn } from '../mutations';
import { useCurrentDevice, useDeviceStaff } from '../queries';
import { signInErrorMessage } from './LoginPage';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MAX_PIN = 6;

const keyClass =
  'flex h-16 items-center justify-center rounded-xl border border-border bg-surface-2 text-2xl font-semibold tabular-nums transition-colors hover:bg-border active:bg-border-strong';

function PinPad({ staff, onBack }: { staff: StaffOption; onBack: () => void }) {
  const [pin, setPin] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const signIn = usePinSignIn(() => void navigate(from, { replace: true }));
  const error = signIn.isError ? signInErrorMessage(signIn.error, 'Wrong PIN.') : null;

  const press = (digit: string) => setPin((p) => (p.length < MAX_PIN ? p + digit : p));

  const submit = () => signIn.mutate({ userId: staff.id, pin }, { onError: () => setPin('') });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
        <p className="font-medium">{staff.name}</p>
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 text-sm font-medium text-primary-800 underline-offset-4 hover:underline"
        >
          Not you?
        </button>
      </div>
      <div aria-label="PIN entered" role="status" className="flex justify-center gap-3 py-1">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`size-3.5 rounded-full ${i < pin.length ? 'bg-text' : 'border-2 border-border-strong'}`}
          />
        ))}
        <span className="sr-only">{pin.length} digits</span>
      </div>
      {error && <AuthError>{error}</AuthError>}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button type="button" className={`${keyClass} text-base`} onClick={() => setPin('')}>
          Clear
        </button>
        <button type="button" className={keyClass} onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          aria-label="Delete last digit"
          className={keyClass}
          onClick={() => setPin((p) => p.slice(0, -1))}
        >
          <Delete aria-hidden="true" className="size-6" />
        </button>
      </div>
      <Button size="lg" disabled={pin.length < 4} loading={signIn.isPending} onClick={submit}>
        Sign in
      </Button>
    </div>
  );
}

const managerLink = (
  <Link to="/login" className="font-medium text-primary-800 underline-offset-4 hover:underline">
    Manager sign in
  </Link>
);

export function PinPage() {
  const device = useCurrentDevice();
  const staff = useDeviceStaff(Boolean(device.data));
  const [selected, setSelected] = useState<StaffOption | null>(null);

  if (device.isPending) return <LoadingScreen />;
  if (!device.data) {
    return (
      <AuthCard
        icon={<MonitorX />}
        title="Staff sign in"
        description="This device is not registered. Ask a manager to sign in and register it."
        footer={managerLink}
      >
        <p className="text-center text-sm text-muted">
          A manager registers counters, waiter phones and kitchen screens in Admin → Devices.
        </p>
      </AuthCard>
    );
  }

  if (selected) {
    return (
      <AuthCard icon={<KeyRound />} title="Enter your PIN" description={device.data.name}>
        <PinPad staff={selected} onBack={() => setSelected(null)} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={<UsersRound />}
      title="Who is signing in?"
      description={device.data.name}
      footer={managerLink}
    >
      {staff.isPending ? (
        <LoadingScreen />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(staff.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s)}
              className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-800"
              >
                {s.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{s.name}</span>
                <span className="text-xs text-subtle capitalize">{s.role.toLowerCase()}</span>
              </span>
            </button>
          ))}
          {staff.data?.length === 0 && (
            <p className="col-span-2 text-center text-sm text-muted">
              No staff have a PIN yet. A manager can set one in Admin → Staff.
            </p>
          )}
        </div>
      )}
    </AuthCard>
  );
}
