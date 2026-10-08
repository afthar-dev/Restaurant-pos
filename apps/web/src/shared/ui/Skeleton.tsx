import { cn } from '@/shared/lib/cn';

/** A grey placeholder shaped like the content that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-border', className)} />;
}

/** A few placeholder rows for a list or a card while it loads. Announced as "Loading…". */
export function LoadingScreen({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('h-12', i === rows - 1 && 'w-2/3')} />
      ))}
    </div>
  );
}
