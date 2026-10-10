import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** A whole-screen message: an icon, a heading, one sentence and (maybe) the way forward. */
export function Notice({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-primary-800">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="max-w-xs text-muted">{children}</p>
      {action && <div className="mt-2 w-full max-w-xs">{action}</div>}
    </div>
  );
}
