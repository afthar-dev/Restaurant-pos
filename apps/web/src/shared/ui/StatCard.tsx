import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { Card } from './Card';

/** A headline number: "Sales today ₹12,400". */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'danger';
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase [&_svg]:size-4">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold tracking-tight tabular-nums',
          tone === 'danger' ? 'text-red-700' : 'text-text',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </Card>
  );
}
