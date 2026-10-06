import { useEffect, useRef, useState, type ReactNode } from 'react';

export const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-base disabled:bg-slate-100';
export const primaryButton =
  'rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60';
export const secondaryButton =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700';
export const dangerButton =
  'rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60';

export type FieldErrors = Record<string, string>;

/** First message per top-level field from a failed Zod parse. */
export function fieldErrors(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

/** An inline "are you sure" bar; browsers' confirm() is avoided so the step is testable. */
export function ConfirmBar({
  question,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
      <p className="text-sm text-red-900">{question}</p>
      <button type="button" className={dangerButton} onClick={onConfirm} disabled={busy}>
        {confirmLabel}
      </button>
      <button type="button" className={secondaryButton} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Something went wrong. Check the connection and try again.';
}

/** Inline "rename" form used in setup lists. */
export function RenameForm({
  id,
  current,
  busy,
  error,
  onSave,
  onCancel,
}: {
  id: string;
  current: string;
  busy?: boolean;
  error?: string | null;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(current);
  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <Field id={id} label={`New name for ${current}`} error={error ?? undefined}>
        <input
          id={id}
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <button type="submit" className={primaryButton} disabled={busy}>
        Save name
      </button>
      <button type="button" className={secondaryButton} onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/**
 * A modal panel pinned to the bottom of the screen on phones and centred on larger screens,
 * so it is visible wherever the list was scrolled. Focus moves into it; Escape closes it.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:items-center">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl outline-none sm:max-w-lg sm:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}
