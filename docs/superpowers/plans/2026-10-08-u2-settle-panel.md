# U2 Settle Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Take payment" dialog for whole-bill payments with an inline Settle panel: pick Cash / UPI / Card, then one confirm that names amount and mode.

**Architecture:** Pure helpers (`features/billing/settle.ts`) suggest cash notes and work out change. `SettlePanel` holds the choose → confirm states and records through the existing `useAddPayment` hook (idempotency key and double-tap guard already there). `useSettleKeys` adds C/U/K/Enter/Esc for counter keyboards. `BillSettle` wraps the panel and the existing `PaymentSheet` (for split or part payments) and is rendered at the top of the open bill through a new `settle` slot on `BillArea` → `BillView`. No API change.

**Tech Stack:** React 19, TanStack Query, Tailwind 4 kit in `shared/ui`, Vitest + Testing Library + vitest-axe.

**Spec:** `docs/superpowers/specs/2026-10-08-u2-settle-panel-design.md`

## Global Constraints

- Frontend only (`apps/web`). No change to `apps/api` or `packages/shared`.
- Money is integer paise; show it with `rupees()` from `@/shared/lib/money`; parse typed rupees with `parseRupees` from `@rpos/shared` (returns `number | null`).
- Gate: the panel renders only for `bill.status === 'OPEN'` and `useCan('payment.take')`.
- Mode buttons at least 56 px tall (`min-h-14`); all other targets at least 44 px (`min-h-11`).
- Every recorded payment needs an explicit confirm naming amount and mode.
- Build with the kit (`Button`, `Field`, `MoneyInput`, `ErrorNote`, `cn`) and colour tokens; see `apps/web/ARCHITECTURE.md` "UI kit".
- Commands run from `apps/web`: `npx vitest run <path>`, `npx tsc --noEmit -p tsconfig.json`; lint from repo root: `pnpm lint`.

## Review Focus

1. Cashier types "c" or "u" in the menu search box while a bill is open → the mode must not change (keys ignored in fields).
2. Enter pressed while focus is on **Back** → goes back, does not confirm (native Enter on focused buttons wins).
3. A discount or another device's part payment changes `bill.due` while Confirm is showing → panel returns to Choose; nobody confirms the old amount.
4. Double tap on Confirm → exactly one POST.
5. Pressing U while the Void dialog is open → nothing happens behind the dialog.

Each is pinned by a test in Task 2 or Task 3.

---

### Task 1: Cash helpers

**Files:**
- Create: `apps/web/src/features/billing/settle.ts`
- Test: `apps/web/src/features/billing/settle.test.ts`

**Interfaces:**
- Produces: `suggestNotes(due: number): number[]` (paise, ascending, at most 3, all `> due`); `type CashOutcome = { change: number } | { short: number }`; `cashOutcome(due: number, tendered: number): CashOutcome`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { cashOutcome, suggestNotes } from './settle';

describe('suggestNotes', () => {
  it('rounds up to the next ₹50, ₹100 and ₹500, then big notes', () => {
    expect(suggestNotes(117000)).toEqual([120000, 150000, 200000]);
    expect(suggestNotes(4000)).toEqual([5000, 10000, 50000]);
    expect(suggestNotes(47300)).toEqual([50000, 200000]);
  });

  it('never suggests the exact amount', () => {
    expect(suggestNotes(120000)).toEqual([125000, 130000, 150000]);
  });

  it('handles paise and nothing due', () => {
    expect(suggestNotes(47350)).toEqual([50000, 200000]);
    expect(suggestNotes(0)).toEqual([]);
  });
});

describe('cashOutcome', () => {
  it('gives change or the shortfall', () => {
    expect(cashOutcome(47300, 50000)).toEqual({ change: 2700 });
    expect(cashOutcome(47300, 47300)).toEqual({ change: 0 });
    expect(cashOutcome(73200, 50000)).toEqual({ short: 23200 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/billing/settle.test.ts`
Expected: FAIL, cannot resolve `./settle`.

- [ ] **Step 3: Write minimal implementation**

```ts
const RUPEE = 100;

/**
 * Notes a customer is likely to hand over for `due` paise: the next ₹50, ₹100 and ₹500, then
 * ₹500 and ₹2,000. Only amounts above `due`, smallest first, at most three.
 */
export function suggestNotes(due: number): number[] {
  if (due <= 0) return [];
  const nextMultiple = (step: number) => (Math.floor(due / step) + 1) * step;
  const candidates = [
    nextMultiple(50 * RUPEE),
    nextMultiple(100 * RUPEE),
    nextMultiple(500 * RUPEE),
    500 * RUPEE,
    2000 * RUPEE,
  ];
  return [...new Set(candidates.filter((n) => n > due))].sort((a, b) => a - b).slice(0, 3);
}

export type CashOutcome = { change: number } | { short: number };

/** Change to give back, or how much more cash is needed. */
export function cashOutcome(due: number, tendered: number): CashOutcome {
  return tendered >= due ? { change: tendered - due } : { short: due - tendered };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/billing/settle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/billing/settle.ts apps/web/src/features/billing/settle.test.ts
git commit -m "feat(web): cash note suggestions and change for quick settle"
```

---

### Task 2: SettlePanel and keys

**Files:**
- Create: `apps/web/src/features/billing/components/useSettleKeys.ts`
- Create: `apps/web/src/features/billing/components/SettlePanel.tsx`
- Test: `apps/web/src/features/billing/components/SettlePanel.test.tsx`

**Interfaces:**
- Consumes: `suggestNotes`, `cashOutcome` (Task 1); `useAddPayment(bill, onRecorded)` from `../mutations` returning `{ pay(body, { onSuccess, onError }), isPending, ... }`.
- Produces:
  - `type SettleKey = 'c' | 'u' | 'k' | 'enter' | 'escape'`; `useSettleKeys(handler: (key: SettleKey) => boolean): void` (handler returns true when it acted).
  - `SettlePanel(props: { bill: Bill; onPaid: (updated: Bill) => void; onMore: () => void; autoFocus?: boolean })`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, screen } from '@testing-library/react';
import type { Permission } from '@rpos/shared';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/shared/session/store';
import { expectNoAxeViolations } from '@/test/a11y';
import { bill } from '@/test/fixtures';
import { callsTo, json, mockApi, sessionBody } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import type { Bill } from '../types';
import { SettlePanel } from './SettlePanel';

const CASHIER: Permission[] = ['bill.print', 'payment.take'];
const PAID = () => json(bill({ status: 'PAID', paid: 47300, due: 0 }), 201);

function setup(handlers = {}, props: Partial<Parameters<typeof SettlePanel>[0]> = {}) {
  useSession.getState().setSession(sessionBody('CASHIER', CASHIER));
  const mock = mockApi(handlers);
  const onPaid = vi.fn();
  const onMore = vi.fn();
  const view = renderWithProviders(
    <SettlePanel bill={bill()} onPaid={onPaid} onMore={onMore} {...props} />,
  );
  return { mock, onPaid, onMore, view };
}

const posts = (mock: ReturnType<typeof mockApi>) =>
  callsTo(mock, 'POST', '/api/bills/b1/payments');
const sent = (mock: ReturnType<typeof mockApi>, i = 0) =>
  JSON.parse(String(posts(mock)[i]?.[1]?.body));
const keyOf = (mock: ReturnType<typeof mockApi>, i: number) =>
  new Headers(posts(mock)[i]?.[1]?.headers).get('Idempotency-Key');

describe('SettlePanel', () => {
  it('takes a whole-bill UPI payment in two taps', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    expect(screen.getByRole('heading', { name: 'Bill 12 · ₹473 due' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'UPI', amount: 47300 });
  });

  it('records nothing after Back', () => {
    const { mock } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus();
    expect(posts(mock)).toHaveLength(0);
  });

  it('takes exact cash without a tendered amount', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    expect(screen.getByRole('button', { name: 'Exact' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 cash' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'CASH', amount: 47300 });
  });

  it('shows the change for a note and sends what was handed over', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('button', { name: '₹500' }));
    expect(screen.getByText('Change ₹27')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 cash · change ₹27' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'CASH', amount: 47300, tendered: 50000 });
  });

  it('blocks short cash typed in Other', () => {
    const { mock } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    fireEvent.change(screen.getByLabelText('Other amount (₹)'), { target: { value: '400' } });
    expect(screen.getByText('₹73 more needed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm ₹473 cash' })).toBeDisabled();
    expect(posts(mock)).toHaveLength(0);
  });

  it('retries a failed payment with the same request id', async () => {
    let calls = 0;
    const { mock, onPaid } = setup({
      'POST /api/bills/b1/payments': () =>
        ++calls === 1 ? json({ code: 'NETWORK', message: 'Network down' }, 503) : PAID(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(keyOf(mock, 1)).toBe(keyOf(mock, 0));
  });

  it('records once on a double tap', async () => {
    const { mock } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    const confirm = screen.getByRole('button', { name: 'Confirm ₹473 by UPI' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await expect.poll(() => posts(mock).length).toBe(1);
    expect(posts(mock)).toHaveLength(1);
  });

  it('goes back to the modes when the amount due changes', () => {
    const { view } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    const changed: Bill = bill({ due: 40000, paid: 7300 });
    view.rerender(<SettlePanel bill={changed} onPaid={() => undefined} onMore={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Bill 12 · ₹400 due' })).toBeInTheDocument();
  });

  it('opens the full sheet for split or part payments', () => {
    const { onMore } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Split or part payment' }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('focuses Cash when asked, for a bill just created', () => {
    setup({}, { autoFocus: true });
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveFocus();
  });

  it('has no accessibility problems in either state', async () => {
    setup();
    await expectNoAxeViolations();
    fireEvent.click(screen.getByRole('button', { name: 'Cash' }));
    await expectNoAxeViolations();
  });
});

describe('SettlePanel keys', () => {
  it('picks a mode with U and confirms with Enter', async () => {
    const { mock, onPaid } = setup({ 'POST /api/bills/b1/payments': PAID });
    fireEvent.keyDown(document.body, { key: 'u' });
    expect(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' })).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await expect.poll(() => onPaid.mock.calls.length).toBe(1);
    expect(sent(mock)).toEqual({ mode: 'UPI', amount: 47300 });
  });

  it('goes back with Escape', () => {
    setup();
    fireEvent.keyDown(document.body, { key: 'k' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Card' })).toBeInTheDocument();
  });

  it('ignores keys typed in a field', () => {
    setup();
    const search = document.createElement('input');
    document.body.append(search);
    fireEvent.keyDown(search, { key: 'u' });
    expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull();
    search.remove();
  });

  it('leaves Enter on a focused button to that button', () => {
    const { mock } = setup();
    fireEvent.keyDown(document.body, { key: 'u' });
    const back = screen.getByRole('button', { name: 'Back' });
    back.focus();
    fireEvent.keyDown(back, { key: 'Enter' });
    expect(posts(mock)).toHaveLength(0);
  });

  it('ignores keys while a dialog is open', () => {
    setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    fireEvent.keyDown(document.body, { key: 'u' });
    expect(screen.queryByRole('button', { name: /^Confirm/ })).toBeNull();
    dialog.remove();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/billing/components/SettlePanel.test.tsx`
Expected: FAIL, cannot resolve `./SettlePanel`.

- [ ] **Step 3: Write `useSettleKeys.ts`**

```ts
import { useEffect, useRef } from 'react';

export type SettleKey = 'c' | 'u' | 'k' | 'enter' | 'escape';

const KEYS: Record<string, SettleKey> = {
  c: 'c',
  u: 'u',
  k: 'k',
  enter: 'enter',
  escape: 'escape',
};

// The most recently mounted panel owns the keys.
const owners: symbol[] = [];

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a, [role="button"]') !== null;
}

/**
 * Counter keyboard keys for settling a bill: C, U, K, Enter and Escape. Ignored while typing
 * in a field, with a modifier held or while a dialog is open; Enter on a focused button stays
 * that button's.
 */
export function useSettleKeys(handler: (key: SettleKey) => boolean) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const id = Symbol('settle-keys');
    owners.push(id);
    const onKeyDown = (event: KeyboardEvent) => {
      if (owners[owners.length - 1] !== id) return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = KEYS[event.key.toLowerCase()];
      if (!key) return;
      if (key === 'enter' && isControl(event.target)) return;
      if (latest.current(key)) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      owners.splice(owners.indexOf(id), 1);
    };
  }, []);
}
```

- [ ] **Step 4: Write `SettlePanel.tsx`**

```tsx
import { parseRupees, type PaymentMode } from '@rpos/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { rupees } from '@/shared/lib/money';
import { Button, describeError, ErrorNote, Field, MoneyInput } from '@/shared/ui';
import { useAddPayment } from '../mutations';
import { cashOutcome, suggestNotes } from '../settle';
import type { Bill } from '../types';
import { useSettleKeys, type SettleKey } from './useSettleKeys';

const MODES: { mode: PaymentMode; label: string; key: SettleKey }[] = [
  { mode: 'CASH', label: 'Cash', key: 'c' },
  { mode: 'UPI', label: 'UPI', key: 'u' },
  { mode: 'CARD', label: 'Card', key: 'k' },
];

type Tender = { kind: 'exact' } | { kind: 'note'; amount: number } | { kind: 'other' };

/**
 * Settles a whole open bill in two taps: choose Cash, UPI or Card, then one confirm that names
 * the amount and mode. Cash shows suggested notes and the change. Splits and part payments go
 * to the full sheet through `onMore`.
 */
export function SettlePanel({
  bill,
  onPaid,
  onMore,
  autoFocus = false,
}: {
  bill: Bill;
  onPaid: (updated: Bill) => void;
  onMore: () => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const payment = useAddPayment(bill, onPaid);
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [tender, setTender] = useState<Tender>({ kind: 'exact' });
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const modeButtons = useRef(new Map<PaymentMode, HTMLButtonElement>());
  const confirmButton = useRef<HTMLButtonElement>(null);
  const lastMode = useRef<PaymentMode | null>(null);
  const panel = useRef<HTMLElement>(null);

  // Another device or a discount changed what is due: start again so nobody confirms an old amount.
  useEffect(() => {
    setMode(null);
    setTender({ kind: 'exact' });
    setOther('');
    setError(null);
  }, [bill.due]);

  useEffect(() => {
    if (!autoFocus) return;
    panel.current?.scrollIntoView({ block: 'nearest' });
    modeButtons.current.get('CASH')?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (mode) confirmButton.current?.focus();
    else if (lastMode.current) modeButtons.current.get(lastMode.current)?.focus();
  }, [mode]);

  const cash = mode === 'CASH';
  const tendered =
    !cash || tender.kind === 'exact'
      ? undefined
      : tender.kind === 'note'
        ? tender.amount
        : parseRupees(other.trim());
  const outcome = typeof tendered === 'number' ? cashOutcome(bill.due, tendered) : null;
  const short = outcome && 'short' in outcome ? outcome.short : 0;
  const change = outcome && 'change' in outcome ? outcome.change : 0;
  const otherInvalid = cash && tender.kind === 'other' && tendered === null;
  const canConfirm = mode !== null && !payment.isPending && short === 0 && !otherInvalid;

  function choose(next: PaymentMode) {
    lastMode.current = next;
    setError(null);
    setTender({ kind: 'exact' });
    setOther('');
    setMode(next);
  }

  function back() {
    if (payment.isPending) return;
    setError(null);
    setMode(null);
  }

  function confirm() {
    if (!mode || !canConfirm) return;
    setError(null);
    payment.pay(
      { mode, amount: bill.due, ...(typeof tendered === 'number' ? { tendered } : {}) },
      {
        onSuccess: (updated) => {
          if (updated.status !== 'PAID') setMode(null);
        },
        onError: (failure) => setError(describeError(failure)),
      },
    );
  }

  useSettleKeys((key) => {
    if (mode === null) {
      const picked = MODES.find((m) => m.key === key);
      if (!picked) return false;
      choose(picked.mode);
      return true;
    }
    if (key === 'escape') {
      back();
      return true;
    }
    if (key === 'enter' && canConfirm) {
      confirm();
      return true;
    }
    return false;
  });

  const label =
    mode === 'CASH'
      ? `Confirm ${rupees(bill.due)} cash${change > 0 ? ` · change ${rupees(change)}` : ''}`
      : mode === 'UPI'
        ? `Confirm ${rupees(bill.due)} by UPI`
        : `Confirm ${rupees(bill.due)} by card`;

  return (
    <section
      ref={panel}
      aria-labelledby={`${id}-title`}
      className="flex basis-full flex-col gap-3 rounded-lg border border-primary-200 bg-primary-50/40 p-3"
    >
      <h4 id={`${id}-title`} className="text-lg font-semibold tabular-nums">
        {`Bill ${bill.billNo} · ${rupees(bill.due)} due`}
      </h4>

      {mode === null ? (
        <>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Payment mode">
            {MODES.map((m) => (
              <button
                key={m.mode}
                ref={(node) => {
                  if (node) modeButtons.current.set(m.mode, node);
                  else modeButtons.current.delete(m.mode);
                }}
                type="button"
                aria-keyshortcuts={m.key.toUpperCase()}
                className="relative flex min-h-14 items-center justify-center rounded-lg border border-border-strong bg-surface text-lg font-semibold shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 active:bg-primary-100"
                onClick={() => choose(m.mode)}
              >
                {m.label}
                <kbd
                  aria-hidden="true"
                  className="absolute top-1 right-1.5 hidden font-sans text-xs text-subtle lg:block"
                >
                  {m.key.toUpperCase()}
                </kbd>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="min-h-11 self-start text-sm font-medium text-primary-800 underline-offset-4 hover:underline"
            onClick={onMore}
          >
            Split or part payment
          </button>
        </>
      ) : (
        <>
          {cash && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Cash received">
                <TenderButton
                  pressed={tender.kind === 'exact'}
                  onClick={() => setTender({ kind: 'exact' })}
                >
                  Exact
                </TenderButton>
                {suggestNotes(bill.due).map((note) => (
                  <TenderButton
                    key={note}
                    pressed={tender.kind === 'note' && tender.amount === note}
                    onClick={() => setTender({ kind: 'note', amount: note })}
                  >
                    {rupees(note)}
                  </TenderButton>
                ))}
              </div>
              <Field id={`${id}-other`} label="Other amount (₹)">
                <MoneyInput
                  id={`${id}-other`}
                  className="max-w-40"
                  value={other}
                  onFocus={() => setTender({ kind: 'other' })}
                  onChange={(e) => {
                    setTender({ kind: 'other' });
                    setOther(e.target.value);
                  }}
                />
              </Field>
              <p aria-live="polite" className="min-h-8 text-2xl font-semibold tabular-nums">
                {short > 0 ? (
                  <span className="text-red-700">{`${rupees(short)} more needed`}</span>
                ) : change > 0 ? (
                  <span className="text-green-800">{`Change ${rupees(change)}`}</span>
                ) : null}
              </p>
            </div>
          )}
          <ErrorNote message={error} />
          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirmButton}
              size="lg"
              className="flex-1"
              loading={payment.isPending}
              disabled={!canConfirm}
              onClick={confirm}
            >
              {label}
            </Button>
            <Button variant="secondary" size="lg" disabled={payment.isPending} onClick={back}>
              Back
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function TenderButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-md border px-4 text-base font-semibold tabular-nums transition-colors',
        pressed
          ? 'border-primary-700 bg-primary-700 text-white'
          : 'border-border-strong bg-surface hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}
```

`Button` must forward its ref for `confirmButton`. If `shared/ui/Button.tsx` does not take a ref, add it: in React 19 a function component receives `ref` as a prop, so add `ref?: Ref<HTMLButtonElement>` to `ButtonProps` and pass `ref={ref}` to the rendered `<button>` / `Slot`. Keep the existing tests in `shared/ui/ui.test.tsx` green.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/billing/components/SettlePanel.test.tsx src/shared/ui`
Expected: PASS (all SettlePanel and kit tests).

- [ ] **Step 6: Typecheck, lint, commit**

Run: `npx tsc --noEmit -p tsconfig.json` (no errors) and, from the repo root, `pnpm lint` (clean).

```bash
git add apps/web/src/features/billing/components/SettlePanel.tsx apps/web/src/features/billing/components/useSettleKeys.ts apps/web/src/features/billing/components/SettlePanel.test.tsx apps/web/src/shared/ui/Button.tsx
git commit -m "feat(web): settle panel — pay a whole bill with a mode and one confirm"
```

---

### Task 3: Put the panel on the open bill

**Files:**
- Create: `apps/web/src/features/billing/components/BillSettle.tsx`
- Modify: `apps/web/src/features/billing/components/BillActions.tsx` (drop Take payment and the pay sheet; keep Void)
- Modify: `apps/web/src/features/billing/components/BillView.tsx` (new `settle?: ReactNode` slot under the header)
- Modify: `apps/web/src/features/billing/components/BillArea.tsx` (new `settle?: (bill: Bill, justCreated: boolean) => ReactNode` prop; remember the bill created here)
- Modify: `apps/web/src/features/billing/index.ts` (export `BillSettle`)
- Modify: `apps/web/src/features/service/components/OrderWorkspace.tsx` (pass `settle`)
- Test: `apps/web/src/features/billing/components/payment.test.tsx` (workspace cases)

**Interfaces:**
- Consumes: `SettlePanel` (Task 2); existing `PaymentSheet({ bill, onPaid, onClose })`, `useRefreshOrder()` from `@/features/orders`.
- Produces: `BillSettle({ bill, onPaid, justCreated }: { bill: Bill; onPaid: (b: Bill) => void; justCreated: boolean })`; `BillArea` prop `settle`; `BillView` prop `settle`.

- [ ] **Step 1: Update the workspace tests (failing)**

In `payment.test.tsx`, replace the body of `it('takes the payment, says the table is free and returns to the floor', …)` after `renderWithProviders(...)` with:

```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    expect(await screen.findByText('Bill 12 paid. T1 is free.')).toBeInTheDocument();
    await expect.poll(() => onClosed.mock.calls.length, { timeout: 4000 }).toBe(1);
```

In `it('does not offer payment to staff who cannot take it', …)` replace the last line with:

```tsx
    expect(screen.queryByRole('button', { name: 'UPI' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Split or part payment' })).toBeNull();
```

Add these cases inside the same `describe` block:

```tsx
  it('opens the full sheet for a part payment from the bill', async () => {
    asCashier();
    const billed = order({
      status: 'BILLED',
      items: [line({ id: 'l2', status: 'SENT', kotId: 'k2', billedQuantity: 1 })],
    });
    mockApi({
      'GET /api/orders/o1': () => json(billed),
      'GET /api/orders/o1/bills': () => json([bill()]),
    });
    renderWithProviders(<OrderWorkspace orderId="o1" layout="stack" onClosed={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Split or part payment' }));
    expect(await screen.findByRole('dialog', { name: 'Payment for bill 12' })).toBeInTheDocument();
  });

  it('bills a parcel and settles it on the same screen', async () => {
    asCashier();
    let billed = false;
    let paid = false;
    const parcel = order({
      type: 'PARCEL',
      tableName: null,
      tokenNo: 7,
      items: [line({ id: 'l2', status: 'SENT', kotId: 'k2' })],
    });
    const parcelBill = (partial = {}) =>
      bill({ orderType: 'PARCEL', tableName: null, tokenNo: 7, ...partial });
    mockApi({
      'GET /api/orders/o1': () =>
        json(paid ? { ...parcel, status: 'CLOSED' } : billed ? { ...parcel, status: 'BILLED' } : parcel),
      'GET /api/orders/o1/bills': () =>
        json(billed ? [paid ? parcelBill({ status: 'PAID', paid: 47300, due: 0 }) : parcelBill()] : []),
      'POST /api/orders/o1/bills': () => {
        billed = true;
        return json({ ...parcelBill(), printQueued: 1 }, 201);
      },
      'POST /api/bills/b1/payments': () => {
        paid = true;
        return json(parcelBill({ status: 'PAID', paid: 47300, due: 0 }), 201);
      },
    });
    const onClosed = vi.fn();
    renderWithProviders(<OrderWorkspace orderId="o1" layout="stack" onClosed={onClosed} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bill' }));
    expect(await screen.findByRole('button', { name: 'Cash' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'UPI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ₹473 by UPI' }));
    await expect.poll(() => onClosed.mock.calls.length, { timeout: 4000 }).toBe(1);
  });
```

Check `order()` in `src/test/fixtures.ts` accepts `type`, `tableName` and `tokenNo`; if a field name differs, use the fixture's name. If `orderLabel` for a parcel needs other fields, copy them from an existing parcel test in `billing.test.tsx`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/billing/components/payment.test.tsx`
Expected: FAIL — no `UPI` button in the workspace (still "Take payment").

- [ ] **Step 3: Create `BillSettle.tsx`**

```tsx
import { useState } from 'react';
import { useRefreshOrder } from '@/features/orders';
import { useCan } from '@/shared/session/store';
import type { Bill } from '../types';
import { PaymentSheet } from './PaymentSheet';
import { SettlePanel } from './SettlePanel';

/** Payment on an open bill: the quick settle panel, and the full sheet for splits and parts. */
export function BillSettle({
  bill,
  onPaid,
  justCreated,
}: {
  bill: Bill;
  onPaid: (updated: Bill) => void;
  justCreated: boolean;
}) {
  const canPay = useCan('payment.take');
  const refresh = useRefreshOrder();
  const [sheet, setSheet] = useState(false);
  if (bill.status !== 'OPEN' || !canPay) return null;

  const paid = (updated: Bill) => {
    if (updated.status === 'PAID') setSheet(false);
    void refresh(bill.orderId);
    onPaid(updated);
  };

  return (
    <>
      <SettlePanel
        bill={bill}
        onPaid={paid}
        onMore={() => setSheet(true)}
        autoFocus={justCreated}
      />
      {sheet && <PaymentSheet bill={bill} onPaid={paid} onClose={() => setSheet(false)} />}
    </>
  );
}
```

- [ ] **Step 4: Trim `BillActions.tsx` to Void only**

```tsx
import { useState } from 'react';
import { useCan } from '@/shared/session/store';
import { secondaryButton } from '@/shared/ui';
import type { Bill } from '../types';
import { VoidSheet } from './VoidSheet';

/** Void an unpaid or paid bill. Payment lives in `BillSettle`. */
export function BillActions({ bill }: { bill: Bill }) {
  const canVoid = useCan('bill.void');
  const canBill = useCan('bill.print');
  const [voiding, setVoiding] = useState(false);
  if (bill.status === 'VOID' || !(canVoid || canBill)) return null;
  return (
    <>
      <button
        type="button"
        className={`${secondaryButton} min-h-11`}
        onClick={() => setVoiding(true)}
      >
        {canVoid ? 'Void' : 'Void (manager)'}
      </button>
      {voiding && <VoidSheet bill={bill} onDone={() => setVoiding(false)} />}
    </>
  );
}
```

Remove the `onPaid` prop from every `BillActions` call site (only `OrderWorkspace`).

- [ ] **Step 5: Add the `settle` slot to `BillView`**

Change the signature to `export function BillView({ bill, actions, settle }: { bill: Bill; actions?: ReactNode; settle?: ReactNode })` and render `{settle}` directly after the void-reason paragraph (before the `<ul>` of lines):

```tsx
      {bill.status === 'VOID' && bill.voidReason && (
        <p className="text-muted">Voided: {bill.voidReason}</p>
      )}
      {settle}
```

- [ ] **Step 6: Wire `BillArea`**

Add the prop `settle?: (bill: Bill, justCreated: boolean) => ReactNode` and a state `const [created, setCreated] = useState<string | null>(null);`. In the `useCreateBill` callback add `setCreated(bill.id);` next to `setExpanded(bill.id);`. Render:

```tsx
          <BillView
            key={bill.id}
            bill={bill}
            actions={billActions?.(bill)}
            settle={settle?.(bill, bill.id === created)}
          />
```

Update the doc comment: "`settle` renders payment for the open bill; `justCreated` is true for a bill made on this screen."

- [ ] **Step 7: Wire `OrderWorkspace` and the export**

In `features/billing/index.ts` add `export { BillSettle } from './components/BillSettle';`.

In `OrderWorkspace.tsx`:

```tsx
import { type Bill, BillActions, BillArea, BillSettle } from '@/features/billing';
…
          <BillArea
            order={order.data!}
            billActions={(bill) => <BillActions bill={bill} />}
            settle={(bill, justCreated) => (
              <BillSettle bill={bill} onPaid={setPaid} justCreated={justCreated} />
            )}
          />
```

- [ ] **Step 8: Run the billing, service and orders suites**

Run: `npx vitest run src/features/billing src/features/service src/features/orders`
Expected: PASS. Any remaining test that clicks `Take payment` now opens payment with `Split or part payment` (same sheet) — update it that way.

- [ ] **Step 9: Full checks and commit**

Run: `npx tsc --noEmit -p tsconfig.json`, `npx vitest run`, and from the repo root `pnpm lint`. All green.

```bash
git add apps/web/src/features/billing apps/web/src/features/service/components/OrderWorkspace.tsx
git commit -m "feat(web): settle open bills from the bill itself, parcel to paid on one screen"
```

---

### Task 4: Real-app check and docs

**Files:**
- Modify: `apps/web/ARCHITECTURE.md` (one line under "UI kit": counter keys live in `useSettleKeys`; new keyboard shortcuts must skip fields, dialogs and focused buttons the same way)

- [ ] **Step 1: Check in the browser**

With api and web running and a day open: create a parcel, add a dish, **Send & bill**, then confirm the panel shows with focus on **Cash**; pay by UPI; the paid banner shows and the screen returns. Bill a dine-in table, return to the floor, tap the billed table, pay cash with ₹500 and check the change line. Press U then Esc on a counter keyboard.

- [ ] **Step 2: Docs line and commit**

Add under "UI kit" in `apps/web/ARCHITECTURE.md`:

```markdown
- **Counter keys:** `features/billing/components/useSettleKeys.ts` handles C/U/K/Enter/Esc for
  settling. Any new shortcut must ignore keys typed in fields, keys while a dialog is open and
  Enter on a focused button, the same way.
```

```bash
git add apps/web/ARCHITECTURE.md
git commit -m "docs(web): counter keyboard rule"
```
