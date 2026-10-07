import { DEVICE_TYPES, registerDeviceSchema, type DeviceType } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import { useCurrentDevice } from '@/features/auth';
import {
  ConfirmBar,
  describeError,
  ErrorNote,
  Field,
  fieldErrors,
  type FieldErrors,
  inputClass,
  PageHeader,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';

import { useRegisterDevice, useRevokeDevice } from '../mutations';
import { useDevices } from '../queries';
import { DEVICE_LABEL, type DeviceRow } from '../types';

function formatTime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function RegisterForm() {
  const current = useCurrentDevice();
  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('POS');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<string | null>(null);

  const register = useRegisterDevice((device) => {
    setDone(`This device is now registered as ${device.name}.`);
    setName('');
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
      className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <p className="text-sm text-muted sm:col-span-3">
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
      {done && <p className="text-sm text-green-800 sm:col-span-3">{done}</p>}
      <div className="sm:col-span-3">
        <ErrorNote message={register.isError ? describeError(register.error) : null} />
      </div>
    </form>
  );
}

export function DevicesPage() {
  const devices = useDevices();
  const [confirming, setConfirming] = useState<DeviceRow | null>(null);

  const revoke = useRevokeDevice(() => setConfirming(null));

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        as="h2"
        title="Devices"
        description="Register each counter, waiter phone and kitchen screen. Staff can only use their PIN on a registered device."
      />
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
      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5">
                Name
              </th>
              <th scope="col" className="px-3 py-2.5">
                Used for
              </th>
              <th scope="col" className="px-3 py-2.5">
                Registered by
              </th>
              <th scope="col" className="px-3 py-2.5">
                Last used
              </th>
              <th scope="col" className="px-3 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {devices.data?.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{d.name}</td>
                <td className="px-3 py-2">{DEVICE_LABEL[d.type]}</td>
                <td className="px-3 py-2">{d.createdBy.name}</td>
                <td className="px-3 py-2">{formatTime(d.lastSeenAt)}</td>
                <td className="px-3 py-2 text-right">
                  {d.revokedAt ? (
                    <span className="text-subtle">Revoked</span>
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
