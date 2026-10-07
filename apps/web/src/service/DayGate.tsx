import { parseRupees } from '@rpos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { apiFetch } from '@/shared/api/http';
import { LoadingScreen } from '@/auth/RequireAuth';
import { useCan } from '@/shared/session/store';
import { describeError, ErrorNote, Field, inputClass, primaryButton } from '@/shared/ui';
import { useBusinessDay } from './queries';

function OpenDayForm() {
  const queryClient = useQueryClient();
  const [cash, setCash] = useState('');
  const [error, setError] = useState<string | undefined>();
  const open = useMutation({
    mutationFn: (openingCash: number) =>
      apiFetch('/api/business-day/open', { method: 'POST', body: { openingCash } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['business-day'] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const openingCash = parseRupees(cash.trim() === '' ? '0' : cash);
    if (openingCash === null) {
      setError('Enter an amount like 2000 or 2000.50');
      return;
    }
    setError(undefined);
    open.mutate(openingCash);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mx-auto flex max-w-sm flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Start today's service</h1>
        <p className="text-sm text-slate-600">
          Count the cash in the drawer before the first order. It is checked again at day close.
        </p>
      </div>
      <Field id="opening-cash" label="Cash in the drawer (₹)" error={error}>
        <input
          id="opening-cash"
          inputMode="decimal"
          className={inputClass}
          value={cash}
          onChange={(e) => setCash(e.target.value)}
        />
      </Field>
      <ErrorNote message={open.isError ? describeError(open.error) : null} />
      <button type="submit" className={primaryButton} disabled={open.isPending}>
        Open the day
      </button>
    </form>
  );
}

/** Service screens only work while a business day is open. */
export function DayGate({ children }: { children: ReactNode }) {
  const day = useBusinessDay();
  const canOpen = useCan('day.openClose');

  if (!day.data) {
    return day.isError ? <ErrorNote message={describeError(day.error)} /> : <LoadingScreen />;
  }
  if (!day.data.day) {
    return canOpen ? (
      <OpenDayForm />
    ) : (
      <p className="mx-auto max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-slate-700">
        The day has not been opened yet. Ask a manager to open it.
      </p>
    );
  }
  return <>{children}</>;
}
