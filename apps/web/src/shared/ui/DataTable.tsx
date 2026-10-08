import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface Column<Row> {
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Right-aligned with tabular figures (money, quantities). */
  numeric?: boolean;
  className?: string;
}

/**
 * A semantic table with a sticky header that scrolls sideways on small screens. Shows `empty`
 * instead of an empty table.
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  empty,
  rowClassName,
}: {
  label: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty?: ReactNode;
  rowClassName?: (row: Row) => string | undefined;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
      <table aria-label={label} className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-surface-2 text-xs font-semibold tracking-wide text-muted uppercase">
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={cn('px-3 py-2.5', c.numeric && 'text-right', c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className={cn('hover:bg-surface-2/60', rowClassName?.(row))}>
              {columns.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-3 py-2.5 align-middle',
                    c.numeric && 'text-right tabular-nums',
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
