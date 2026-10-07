import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LoadingScreen } from '@/shared/ui';
import type { StaffOption } from '../api';
import { usePinSignIn } from '../mutations';
import { useCurrentDevice, useDeviceStaff } from '../queries';
import { signInErrorMessage } from './LoginPage';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MAX_PIN = 6;

function PinPad({ staff, onBack }: { staff: StaffOption; onBack: () => void }) {
  const [pin, setPin] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const signIn = usePinSignIn(() => void navigate(from, { replace: true }));
  const error = signIn.isError ? signInErrorMessage(signIn.error, 'Wrong PIN.') : null;

  const press = (digit: string) => setPin((p) => (p.length < MAX_PIN ? p + digit : p));

  const submit = () => signIn.mutate({ userId: staff.id, pin }, { onError: () => setPin('') });

  const keyClass =
    'h-14 rounded-lg border border-slate-300 bg-white text-xl font-semibold active:bg-slate-100';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">{staff.name}</p>
        <button type="button" onClick={onBack} className="text-sm text-emerald-800 underline">
          Not you?
        </button>
      </div>
      <p aria-label="PIN entered" className="text-center font-mono text-3xl tracking-[0.5em]">
        {'•'.repeat(pin.length) || ' '}
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button type="button" className={keyClass} onClick={() => setPin('')}>
          Clear
        </button>
        <button type="button" className={keyClass} onClick={() => press('0')}>
          0
        </button>
        <button type="button" className={keyClass} onClick={() => setPin((p) => p.slice(0, -1))}>
          Back
        </button>
      </div>
      <button
        type="button"
        disabled={pin.length < 4 || signIn.isPending}
        onClick={submit}
        className="rounded-md bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        Sign in
      </button>
    </div>
  );
}

export function PinPage() {
  const device = useCurrentDevice();
  const staff = useDeviceStaff(Boolean(device.data));
  const [selected, setSelected] = useState<StaffOption | null>(null);

  if (device.isPending) return <LoadingScreen />;
  if (!device.data) {
    return (
      <section className="mx-auto flex max-w-sm flex-col gap-3">
        <h1 className="text-2xl font-semibold">Staff sign in</h1>
        <p className="text-slate-700">
          This device is not registered. Ask a manager to sign in and register it.
        </p>
        <Link to="/login" className="text-emerald-800 underline">
          Manager sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Who is signing in?</h1>
        <p className="text-sm text-slate-600">{device.data.name}</p>
      </div>
      {selected ? (
        <PinPad staff={selected} onBack={() => setSelected(null)} />
      ) : staff.isPending ? (
        <LoadingScreen />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(staff.data ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s)}
              className="flex flex-col rounded-lg border border-slate-300 bg-white p-3 text-left"
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-slate-500">{s.role.toLowerCase()}</span>
            </button>
          ))}
          {staff.data?.length === 0 && (
            <p className="col-span-2 text-sm text-slate-600">No staff have a PIN yet.</p>
          )}
        </div>
      )}
      <Link to="/login" className="text-sm text-emerald-800 underline">
        Manager sign in
      </Link>
    </section>
  );
}
