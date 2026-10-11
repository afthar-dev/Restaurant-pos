import { reasonLabel } from '@rpos/shared';
import { Scale } from 'lucide-react';
import type { ReactNode } from 'react';
import { rupees } from '@/shared/lib/money';
import { describeError, EmptyState, ErrorNote, LoadingScreen } from '@/shared/ui';
import { useAccountability } from '../queries';
import type { DateRange } from '../ranges';
import type { AccountabilityFigure, AccountabilityReport } from '../types';

const th = 'px-3 py-2';
const num = 'px-3 py-2 text-right tabular-nums';

const KIND_LABEL = { discount: 'Discount', void: 'Void', cancel: 'Cancelled dish' } as const;

function Table({
  label,
  head,
  textColumns,
  children,
}: {
  label: string;
  head: string[];
  /** How many leading columns hold text; the rest are figures. */
  textColumns: number;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
      <table aria-label={label} className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i < textColumns ? th : `${th} text-right`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

/** "3 · ₹150", or a dash when there is nothing. */
function figure({ count, amount }: AccountabilityFigure) {
  return count === 0 ? '—' : `${count} · ${rupees(amount)}`;
}

function ByReason({ rows }: { rows: AccountabilityReport['byReason'] }) {
  return (
    <Table label="By reason" head={['Type', 'Reason', 'Times', 'Amount']} textColumns={2}>
      {rows.map((r) => (
        <tr key={`${r.kind}:${r.code}`}>
          <td className={th}>{KIND_LABEL[r.kind]}</td>
          <td className={th}>{reasonLabel(r.kind, r.code)}</td>
          <td className={num}>{r.count}</td>
          <td className={num}>{rupees(r.amount)}</td>
        </tr>
      ))}
    </Table>
  );
}

function ByStaff({ rows }: { rows: AccountabilityReport['byStaff'] }) {
  return (
    <Table
      textColumns={1}
      label="By staff"
      head={[
        'Staff',
        'Discounts',
        'Voids',
        'Cancelled dishes',
        'Reprints',
        'Cash out',
        'Mode changes',
      ]}
    >
      {rows.map((s) => (
        <tr key={s.userId}>
          <td className={th}>{s.name}</td>
          <td className={num}>{figure(s.discounts)}</td>
          <td className={num}>{figure(s.voids)}</td>
          <td className={num}>{figure(s.cancels)}</td>
          <td className={num}>{s.reprints || '—'}</td>
          <td className={num}>{figure(s.cashOut)}</td>
          <td className={num}>{s.modeChanges || '—'}</td>
        </tr>
      ))}
    </Table>
  );
}

/** Who gave discounts, voided bills, cancelled dishes and reprinted, and why. */
export function AccountabilityTab({ range }: { range: DateRange }) {
  const report = useAccountability(range);
  const data = report.data;
  if (!data) {
    return report.isError ? <ErrorNote message={describeError(report.error)} /> : <LoadingScreen />;
  }
  if (data.byReason.length === 0 && data.byStaff.length === 0) {
    return (
      <EmptyState
        icon={<Scale />}
        title="No discounts, voids or cancellations"
        description="Nothing to review for these dates."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ErrorNote message={report.isError ? describeError(report.error) : null} />
      <h2 className="text-lg font-semibold">By reason</h2>
      {data.byReason.length === 0 ? (
        <p className="text-sm text-muted">
          No discounts, voids or cancelled dishes in these dates.
        </p>
      ) : (
        <ByReason rows={data.byReason} />
      )}
      <h2 className="text-lg font-semibold">By staff</h2>
      <ByStaff rows={data.byStaff} />
    </div>
  );
}
