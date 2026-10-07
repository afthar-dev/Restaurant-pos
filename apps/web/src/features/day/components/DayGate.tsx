import { parseRupees } from '@rpos/shared';
import { Sunrise } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useCan } from '@/shared/session/store';
import {
  Button,
  describeError,
  EmptyState,
  ErrorNote,
  Field,
  LoadingScreen,
  MoneyInput,
} from '@/shared/ui';
import { useOpenDay } from '../mutations';
import { useBusinessDay } from '../queries';

function OpenDayForm() {
  const [cash, setCash] = useState('');
  const [error, setError] = useState<string | undefined>();
  const open = useOpenDay();

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
      className="mx-auto mt-6 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <Sunrise aria-hidden="true" className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Start today's service</h1>
        <p className="text-sm text-muted">
          Count the cash in the drawer before the first order. It is checked again at day close.
        </p>
      </div>
      <Field id="opening-cash" label="Cash in the drawer (₹)" error={error}>
        <MoneyInput
          id="opening-cash"
          placeholder="0"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
        />
      </Field>
      <ErrorNote message={open.isError ? describeError(open.error) : null} />
      <Button type="submit" size="lg" loading={open.isPending}>
        Open the day
      </Button>
    </form>
  );
}

/** Service screens only work while a business day is open. */
export function DayGate({ children }: { children: ReactNode }) {
  const day = useBusinessDay();
  const canOpen = useCan('day.openClose');

  if (!day.data) {
    return day.isError ? (
      <ErrorNote message={describeError(day.error)} onRetry={() => void day.refetch()} />
    ) : (
      <LoadingScreen />
    );
  }
  if (!day.data.day) {
    return canOpen ? (
      <OpenDayForm />
    ) : (
      <EmptyState
        icon={<Sunrise />}
        title="Waiting for a manager"
        description="The day has not been opened yet. Ask a manager to open it."
      />
    );
  }
  return <>{children}</>;
}
