import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface Stat {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'danger';
}

/**
 * A row of headline figures on one surface, divided by hairlines, instead of one card per
 * number. `bare` drops the outer box when the strip already sits inside a card.
 */
export function StatStrip({
  label,
  items,
  bare = false,
  className,
}: {
  label: string;
  items: Stat[];
  bare?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(!bare && 'overflow-hidden rounded-lg border border-border', className)}
    >
      {/* The 1 px gaps show the border colour behind the cells: rules that wrap with the grid. */}
      <dl
        className={cn(
          'grid gap-px bg-border',
          items.length >= 5
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            : items.length === 4
              ? 'grid-cols-2 lg:grid-cols-4'
              : 'grid-cols-1 sm:grid-cols-3',
        )}
      >
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 bg-surface p-4">
            <dt className="text-xs font-medium text-muted">{item.label}</dt>
            <dd
              className={cn(
                'text-2xl font-semibold tracking-tight tabular-nums',
                item.tone === 'danger' ? 'text-red-700' : 'text-text',
              )}
            >
              {item.value}
            </dd>
            {item.hint && <dd className="text-sm text-muted">{item.hint}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
