import { DEVICE_TYPES, registerDeviceSchema, type DeviceType } from '@rpos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../../auth/api';
import { useCurrentDevice } from '../../auth/hooks';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  fieldErrors,
  inputClass,
  primaryButton,
  secondaryButton,
  type FieldErrors,
} from '../../components/ui';

interface DeviceRow {
  id: string;
  name: string;
  type: DeviceType;
  createdBy: { id: string; name: string };
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export const DEVICE_LABEL: Record<DeviceType, string> = {
  POS: 'Counter (POS)',
  CAPTAIN: 'Waiter phone',
  KDS: 'Kitchen screen',
  PRINT_AGENT: 'Print agent',
};

const devicesKey = ['devices'];

function formatTime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function RegisterForm() {
  const queryClient = useQueryClient();
  const current = useCurrentDevice();
  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('POS');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: (body: { name: string; type: DeviceType }) =>
      apiFetch<{ id: string; name: string; type: DeviceType }>('/api/devices', {
        method: 'POST',
        body,
      }),
    onSuccess: async (device) => {
      setDone(`This device is now registered as ${device.name}.`);
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['device'] });
      await queryClient.invalidateQueries({ queryKey: devicesKey });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setDone(null);
    const parsed = registerDeviceSchema.safeParse({ name: name.trim(), type });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    register.mutate(parsed.data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <p className="text-sm text-slate-600 sm:col-span-3">
        {current.data
          ? `This browser is registered as ${current.data.name}. Registering again replaces that.`
          : 'Register this browser so staff can sign in here with their PIN.'}
      </p>
      <Field id="device-name" label="Device name" error={errors.name}>
        <input
          id="device-name"
          className={inputClass}
          placeholder="Counter 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id="device-type" label="Used for">
        <select
          id="device-type"
          className={inputClass}
          value={type}
          onChange={(e) => setType(e.target.value as DeviceType)}
        >
          {DEVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DEVICE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className={primaryButton} disabled={register.isPending}>
        Register this device
      </button>
      {done && <p className="text-sm text-emerald-800 sm:col-span-3">{done}</p>}
      <div className="sm:col-span-3">
        <ErrorNote message={register.isError ? describeError(register.error) : null} />
      </div>
    </form>
  );
}

export function DevicesPage() {
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: devicesKey,
    queryFn: () => apiFetch<DeviceRow[]>('/api/devices'),
  });
  const [confirming, setConfirming] = useState<DeviceRow | null>(null);

  const revoke = useMutation({
    mutationFn: (d: DeviceRow) => apiFetch<void>(`/api/devices/${d.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: devicesKey });
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Devices</h2>
      <RegisterForm />
      {confirming && (
        <ConfirmBar
          question={`Revoke ${confirming.name}? Anyone signed in on it is signed out, and PIN sign-in stops working there.`}
          confirmLabel={`Yes, revoke ${confirming.name}`}
          onConfirm={() => revoke.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          busy={revoke.isPending}
        />
      )}
      <ErrorNote message={revoke.isError ? describeError(revoke.error) : null} />
      <ErrorNote message={devices.isError ? describeError(devices.error) : null} />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Used for</th>
              <th className="px-3 py-2">Registered by</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {devices.data?.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{d.name}</td>
                <td className="px-3 py-2">{DEVICE_LABEL[d.type]}</td>
                <td className="px-3 py-2">{d.createdBy.name}</td>
                <td className="px-3 py-2">{formatTime(d.lastSeenAt)}</td>
                <td className="px-3 py-2 text-right">
                  {d.revokedAt ? (
                    <span className="text-slate-500">Revoked</span>
                  ) : (
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => setConfirming(d)}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
