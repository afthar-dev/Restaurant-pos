import type { ReactNode } from 'react';

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
