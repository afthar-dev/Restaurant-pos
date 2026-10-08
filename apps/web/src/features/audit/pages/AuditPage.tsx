import { describeError, ErrorNote, PageHeader, secondaryButton } from '@/shared/ui';
import { useAuditLog } from '../queries';

const ACTION_LABEL: Record<string, string> = {
  'auth.override': 'Manager approval',
  'user.create': 'Staff added',
  'user.update': 'Staff changed',
  'user.archive': 'Staff archived',
  'user.restore': 'Staff restored',
  'device.register': 'Device registered',
  'device.revoke': 'Device revoked',
  'outlet.update': 'Settings changed',
};

export function AuditPage() {
  const audit = useAuditLog();
  const rows = audit.data?.pages.flat() ?? [];

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        as="h2"
        title="Audit log"
        description="Who changed what and why: voids, cancellations, discounts, approvals and setup changes."
      />
      <ErrorNote message={audit.isError ? describeError(audit.error) : null} />
      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2.5">
                When
              </th>
              <th scope="col" className="px-3 py-2.5">
                Who
              </th>
              <th scope="col" className="px-3 py-2.5">
                What
              </th>
              <th scope="col" className="px-3 py-2.5">
                Reason
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {new Date(r.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-3 py-2">{r.actor?.name ?? 'System'}</td>
                <td className="px-3 py-2">{ACTION_LABEL[r.action] ?? r.action}</td>
                <td className="px-3 py-2 text-muted">{r.reason ?? ''}</td>
              </tr>
            ))}
            {!audit.isPending && rows.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-subtle" colSpan={4}>
                  Nothing recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {audit.hasNextPage && (
        <button
          type="button"
          className={secondaryButton}
          onClick={() => void audit.fetchNextPage()}
          disabled={audit.isFetchingNextPage}
        >
          Load more
        </button>
      )}
    </section>
  );
}
