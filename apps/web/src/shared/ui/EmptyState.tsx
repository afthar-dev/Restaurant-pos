import type { ReactNode } from 'react';

/** What to show instead of an empty list: what is missing and the next step. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      {icon && (
        <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted [&_svg]:size-6">
          {icon}
        </span>
      )}
      <p className="font-semibold text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
