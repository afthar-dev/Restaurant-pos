import { createUserSchema, PASSWORD_ROLES, ROLES, updateUserSchema, type Role } from '@rpos/shared';
import { useState, type FormEvent } from 'react';
import {
  Button,
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

import { useSaveStaff, useToggleStaffArchive } from '../mutations';
import { useStaff } from '../queries';
import type { Staff } from '../types';
import { Plus } from 'lucide-react';

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
};

function StaffForm({ existing, onDone }: { existing: Staff | null; onDone: () => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [role, setRole] = useState<Role>(existing?.role ?? 'WAITER');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const usesPassword = PASSWORD_ROLES.includes(role);

  const save = useSaveStaff(existing, onDone);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const draft: Record<string, unknown> = { name: name.trim(), phone: phone.trim(), role };
    if (usesPassword && password) draft.password = password;
    if (pin) draft.pin = pin;

    let body: Record<string, unknown> = draft;
    if (existing) {
      body = {};
      for (const key of ['name', 'phone', 'role'] as const) {
        if (draft[key] !== existing[key]) body[key] = draft[key];
      }
      if (draft.password) body.password = draft.password;
      if (draft.pin) body.pin = draft.pin;
    }
    const parsed = (existing ? updateUserSchema : createUserSchema).safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2"
    >
      <h2 className="text-lg font-semibold sm:col-span-2">
        {existing ? `Edit ${existing.name}` : 'Add staff'}
      </h2>
      <Field id="staff-name" label="Name" error={errors.name}>
        <input
          id="staff-name"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id="staff-phone" label="Mobile number" error={errors.phone}>
        <input
          id="staff-phone"
          className={inputClass}
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field id="staff-role" label="Role" error={errors.role}>
        <select
          id="staff-role"
          className={inputClass}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      {usesPassword && (
        <Field
          id="staff-password"
          label="Password"
          error={errors.password}
          hint={
            existing?.hasPassword
              ? 'Leave empty to keep the current password.'
              : 'At least 8 characters.'
          }
        >
          <input
            id="staff-password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      )}
      <Field
        id="staff-pin"
        label={usesPassword ? 'PIN for approvals' : 'PIN'}
        error={errors.pin}
        hint={
          existing?.hasPin
            ? 'Leave empty to keep the current PIN.'
            : usesPassword
              ? 'Optional. Lets them approve discounts and voids on a counter screen.'
              : '4 to 6 digits.'
        }
      >
        <input
          id="staff-pin"
          inputMode="numeric"
          className={inputClass}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <ErrorNote message={save.isError ? describeError(save.error) : null} />
        <div className="flex gap-2">
          <button type="submit" className={primaryButton} disabled={save.isPending}>
            Save
          </button>
          <button type="button" className={secondaryButton} onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function StatusBadge({ staff }: { staff: Staff }) {
  if (staff.archivedAt) return <span className="text-subtle">Archived</span>;
  if (staff.lockedUntil) return <span className="text-amber-700">Locked</span>;
  return <span className="text-green-700">Active</span>;
}

export function StaffPage() {
  const users = useStaff();
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const [confirming, setConfirming] = useState<Staff | null>(null);

  const toggleArchive = useToggleStaffArchive(() => setConfirming(null));

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        as="h2"
        title="Staff"
        description="Owners and managers sign in with phone and password; cashiers and waiters use a PIN on a registered device."
        actions={
          editing === null && (
            <Button icon={<Plus />} onClick={() => setEditing('new')}>
              Add staff
            </Button>
          )
        }
      />

      {editing !== null && (
        <StaffForm existing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      )}

      {confirming && (
        <ConfirmBar
          question={`Archive ${confirming.name}? They are signed out everywhere and can no longer sign in.`}
          confirmLabel={`Yes, archive ${confirming.name}`}
          onConfirm={() => toggleArchive.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          busy={toggleArchive.isPending}
        />
      )}
      <ErrorNote message={toggleArchive.isError ? describeError(toggleArchive.error) : null} />
      <ErrorNote message={users.isError ? describeError(users.error) : null} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5">
                Name
              </th>
              <th scope="col" className="px-3 py-2.5">
                Mobile
              </th>
              <th scope="col" className="px-3 py-2.5">
                Role
              </th>
              <th scope="col" className="px-3 py-2.5">
                Signs in with
              </th>
              <th scope="col" className="px-3 py-2.5">
                Status
              </th>
              <th scope="col" className="px-3 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.isPending && (
              <tr>
                <td className="px-3 py-3 text-subtle" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {users.data?.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 tabular-nums">{s.phone}</td>
                <td className="px-3 py-2">{ROLE_LABEL[s.role]}</td>
                <td className="px-3 py-2">
                  {[s.hasPassword && 'Password', s.hasPin && 'PIN'].filter(Boolean).join(' · ') ||
                    '—'}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge staff={s} />
                </td>
                <td className="flex justify-end gap-2 px-3 py-2">
                  <button type="button" className={secondaryButton} onClick={() => setEditing(s)}>
                    Edit
                  </button>
                  {s.archivedAt ? (
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => toggleArchive.mutate(s)}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => setConfirming(s)}
                    >
                      Archive
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
