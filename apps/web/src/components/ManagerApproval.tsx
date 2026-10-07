import type { Permission } from '@rpos/shared';
import { useQuery } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { apiFetch } from '@/shared/api/http';
import {
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';

/** Asks the server for a one-time approval token for `permission`, signed by that manager. */
export async function requestOverride(
  userId: string,
  pin: string,
  permission: Permission,
): Promise<string> {
  const { overrideToken } = await apiFetch<{ overrideToken: string }>('/api/auth/override', {
    method: 'POST',
    body: { userId, pin, permission },
  });
  return overrideToken;
}

export const isPin = (pin: string) => /^\d{4,6}$/.test(pin);

/** "Manager" picker and "Manager PIN" box, for forms that ask a manager to approve. */
export function ApproverFields({
  idPrefix,
  approverId,
  pin,
  onApprover,
  onPin,
}: {
  idPrefix: string;
  approverId: string;
  pin: string;
  onApprover: (id: string) => void;
  onPin: (pin: string) => void;
}) {
  const approvers = useQuery({
    queryKey: ['approvers'],
    queryFn: () => apiFetch<{ id: string; name: string }[]>('/api/auth/approvers'),
  });
  return (
    <div className="flex flex-wrap gap-3">
      <Field id={`${idPrefix}-approver`} label="Manager">
        <select
          id={`${idPrefix}-approver`}
          className={inputClass}
          value={approverId}
          onChange={(e) => onApprover(e.target.value)}
        >
          <option value="">Choose…</option>
          {approvers.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${idPrefix}-pin`} label="Manager PIN">
        <input
          id={`${idPrefix}-pin`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          className={`${inputClass} w-28`}
          value={pin}
          onChange={(e) => onPin(e.target.value)}
        />
      </Field>
    </div>
  );
}

/** A manager approves one action with their PIN; `onApproved` gets the single-use token. */
export function ManagerApproval({
  permission,
  message,
  onApproved,
  onCancel,
}: {
  permission: Permission;
  message?: string;
  onApproved: (token: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [approverId, setApproverId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!approverId) return setError('Choose the manager.');
    if (!isPin(pin)) return setError('Enter the 4–6 digit PIN.');
    setError(null);
    setBusy(true);
    try {
      onApproved(await requestOverride(approverId, pin, permission));
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      aria-label="Manager approval"
      className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
    >
      {message && <p className="text-sm text-amber-900">{message}</p>}
      <ApproverFields
        idPrefix={id}
        approverId={approverId}
        pin={pin}
        onApprover={setApproverId}
        onPin={setPin}
      />
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={busy}>
          Approve
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}
