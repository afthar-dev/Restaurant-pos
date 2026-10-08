import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

type Describable = ReactElement<{ 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;

/**
 * A label, the control, and its hint or error. A single child control is linked to the hint or
 * error text for screen readers and marked invalid on error.
 */
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
  const noteId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  // Link the hint or error to the control when the field wraps a single element.
  const control = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const linked =
    control && isValidElement(control) && noteId
      ? cloneElement(control as Describable, {
          'aria-describedby': noteId,
          ...(error ? { 'aria-invalid': true } : {}),
        })
      : children;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      {linked}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
