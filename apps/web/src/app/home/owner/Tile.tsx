import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/shared/lib/cn';

const TILE = 'flex min-h-24 min-w-0 flex-col gap-1 rounded-lg border bg-surface p-4 shadow-card';

/** One live figure that opens the screen where it is dealt with. `name` is its spoken label. */
export function Tile({
  to,
  name,
  icon: Icon,
  label,
  children,
  detail,
  attention = false,
}: {
  to: string;
  name: string;
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  detail?: ReactNode;
  /** Draws the border in the brand colour; the figure itself says why. */
  attention?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={name}
      className={cn(
        TILE,
        'transition-colors hover:border-primary-300 hover:bg-primary-50/40',
        attention ? 'border-primary-400' : 'border-border',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold tracking-tight text-text tabular-nums">
        {children}
      </span>
      {detail && <span className="text-sm text-muted">{detail}</span>}
    </Link>
  );
}

/** A figure's unit or word, smaller than the number beside it. */
export function Unit({ children }: { children: ReactNode }) {
  return <span className="text-sm font-medium text-muted">{children}</span>;
}

/** Stands where a tile could not load, with a way to ask again. */
export function TileError({
  label,
  icon: Icon,
  onRetry,
}: {
  label: string;
  icon: LucideIcon;
  onRetry: () => void;
}) {
  return (
    <div className={cn(TILE, 'border-red-200')}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </span>
      <span className="text-sm text-red-700">Could not load.</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary-800 underline-offset-4 hover:underline"
      >
        Try again
      </button>
    </div>
  );
}
