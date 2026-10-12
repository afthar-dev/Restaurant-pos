import { CASH_REASON_KIND, parseRupees, type CashMovementKind } from '@rpos/shared';
import { useId, useState, type FormEvent } from 'react';
import { ManagerApproval } from '@/features/auth';
import { useNotify } from '@/features/notifications';
import { ApiError } from '@/shared/api/http';
import { rupees } from '@/shared/lib/money';
import {
  describeError,
  ErrorNote,
  Field,
  MoneyInput,
  noReason,
  primaryButton,
  ReasonPicker,
  reasonRequest,
  secondaryButton,
  Sheet,
  TabPanel,
  Tabs,
  type ReasonValue,
} from '@/shared/ui';
import { useAddCashMovement } from '../mutations';
import type { NewCashMovement } from '../types';

const TABS: { type: CashMovementKind; label: string; action: string; done: string }[] = [
  { type: 'PAY_IN', label: 'Cash in', action: 'Record cash in', done: 'Cash in' },
  { type: 'PAY_OUT', label: 'Cash out', action: 'Record cash out', done: 'Cash out' },
  { type: 'DROP', label: 'Cash drop', action: 'Record cash drop', done: 'Cash drop' },
];

/** The checks that need no server: an amount, a reason, and a note for "Other". */
function readForm(
  type: CashMovementKind,
  amount: string,
  reason: ReasonValue,
): { body: NewCashMovement } | { problem: { field: 'amount' | 'reason'; text: string } } {
  const paise = parseRupees(amount);
  if (paise === null || paise <= 0) {
    return { problem: { field: 'amount', text: 'Enter the amount in rupees, like 450' } };
  }
  if (reason.code === null) return { problem: { field: 'reason', text: 'Choose a reason.' } };
  if (reason.code === 'OTHER' && reason.note.trim().length < 3) {
    return { problem: { field: 'reason', text: 'Say what happened.' } };
  }
  return { body: { type, amount: paise, ...reasonRequest(reason) } };
}

function CashForm({ type, onDone }: { type: CashMovementKind; onDone: () => void }) {
  const id = useId();
  const tab = TABS.find((t) => t.type === type)!;
  const notify = useNotify();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState(noReason);
  const [problem, setProblem] = useState<{ field: 'amount' | 'reason'; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The request waiting for a manager's PIN, when the API asked for one.
  const [pending, setPending] = useState<NewCashMovement | null>(null);
  const add = useAddCashMovement((movement) => {
    notify({ text: `${tab.done} ${rupees(movement.amount)} recorded.`, tone: 'success' });
    onDone();
  });

  function send(body: NewCashMovement) {
    setError(null);
    add.mutate(body, {
      onError: (failure) => {
        if (failure instanceof ApiError && failure.code === 'APPROVAL_REQUIRED') {
          // A bad or used token comes back the same way: ask again.
          setPending(body);
          if (body.overrideToken) setError('That approval did not work. Ask the manager again.');
        } else {
          setPending(null);
          setError(describeError(failure));
        }
      },
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const read = readForm(type, amount, reason);
    if ('problem' in read) return setProblem(read.problem);
    setProblem(null);
    send(read.body);
  }

  if (pending) {
    return (
      <div className="flex flex-col gap-3">
        <ManagerApproval
          permission="day.openClose"
          message={`A manager must approve this ${tab.label.toLowerCase()} of ${rupees(pending.amount)}.`}
          onApproved={(token) => {
            const { overrideToken: _old, ...rest } = pending;
            setPending(null);
            send({ ...rest, overrideToken: token });
          }}
          onCancel={() => setPending(null)}
        />
        <ErrorNote message={error} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label={tab.label} className="flex flex-col gap-3">
      <Field
        id={`${id}-amount`}
        label="Amount"
        error={problem?.field === 'amount' ? problem.text : undefined}
      >
        <MoneyInput
          id={`${id}-amount`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoComplete="off"
        />
      </Field>
      <ReasonPicker
        kind={CASH_REASON_KIND[type]}
        idPrefix={`${id}-reason`}
        value={reason}
        onChange={setReason}
      />
      {problem?.field === 'reason' && (
        <p role="alert" className="text-sm text-red-700">
          {problem.text}
        </p>
      )}
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="submit" className={`${primaryButton} min-h-11`} disabled={add.isPending}>
          {tab.action}
        </button>
        <button type="button" className={`${secondaryButton} min-h-11`} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Cash into the drawer, out of it, or dropped to the safe or bank. A pay-out or drop by someone
 * who cannot close the day asks a manager for their PIN, but only when the API says so.
 */
export function CashDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<CashMovementKind>('PAY_IN');
  return (
    <Sheet label="Cash in / out" onClose={onClose}>
      <h3 className="text-lg font-semibold">Cash in / out</h3>
      <p className="text-sm text-muted">
        Record money put in or taken out of the drawer, so the expected cash stays right.
      </p>
      <Tabs
        value={type}
        onValueChange={(value) => setType(value as CashMovementKind)}
        label="Kind of cash movement"
        tabs={TABS.map((t) => ({ value: t.type, label: t.label }))}
      >
        {TABS.map((t) => (
          <TabPanel key={t.type} value={t.type}>
            <CashForm type={t.type} onDone={onClose} />
          </TabPanel>
        ))}
      </Tabs>
    </Sheet>
  );
}
