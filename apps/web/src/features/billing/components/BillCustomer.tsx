import { gstinSchema } from '@rpos/shared';
import { useId, useState } from 'react';
import { Button, describeError, ErrorNote, Field, Input } from '@/shared/ui';
import { useSetCustomer } from '../mutations';
import type { Bill } from '../types';

/**
 * The optional B2B customer on a bill: a link that opens a small form (name and GSTIN), then
 * "Bill to …" with Edit. It prints under the bill header, so it is set before printing.
 */
export function BillCustomer({ bill }: { bill: Bill }) {
  const id = useId();
  const save = useSetCustomer(bill);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [gstinError, setGstinError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { name: savedName, gstin: savedGstin } = bill.customer;
  const has = Boolean(savedName || savedGstin);

  function open() {
    setName(savedName ?? '');
    setGstin(savedGstin ?? '');
    setGstinError(undefined);
    setError(null);
    setEditing(true);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = gstin.trim();
    if (trimmed !== '') {
      const parsed = gstinSchema.safeParse(trimmed);
      if (!parsed.success) {
        setGstinError(parsed.error.issues[0]?.message ?? 'Enter a valid GSTIN');
        return;
      }
    }
    setGstinError(undefined);
    setError(null);
    save.mutate(
      { name: name.trim() || null, gstin: trimmed ? trimmed.toUpperCase() : null },
      {
        onSuccess: () => setEditing(false),
        onError: (failure) => setError(describeError(failure)),
      },
    );
  }

  if (!editing) {
    return has ? (
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <span>
          {`Bill to: ${[savedName, savedGstin && `GSTIN ${savedGstin}`].filter(Boolean).join(' · ')}`}
        </span>
        <button
          type="button"
          className="min-h-11 font-medium text-primary-800 underline-offset-4 hover:underline"
          onClick={open}
        >
          Edit customer
        </button>
      </p>
    ) : (
      <button
        type="button"
        className="min-h-11 self-start text-sm font-medium text-primary-800 underline-offset-4 hover:underline"
        onClick={open}
      >
        Add customer GSTIN
      </button>
    );
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit} noValidate>
      <Field id={`${id}-name`} label="Customer name">
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id={`${id}-gstin`} label="Customer GSTIN" error={gstinError}>
        <Input
          id={`${id}-gstin`}
          value={gstin}
          maxLength={15}
          autoCapitalize="characters"
          onChange={(e) => setGstin(e.target.value)}
        />
      </Field>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <Button type="submit" loading={save.isPending}>
          Save customer
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={save.isPending}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
