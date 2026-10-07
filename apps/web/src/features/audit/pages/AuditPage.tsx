import { describeError, ErrorNote, secondaryButton } from '@/shared/ui';
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
      <h2 className="text-xl font-semibold">Audit log</h2>
      <ErrorNote message={audit.isError ? describeError(audit.error) : null} />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">What</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {new Date(r.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-3 py-2">{r.actor?.name ?? 'System'}</td>
                <td className="px-3 py-2">{ACTION_LABEL[r.action] ?? r.action}</td>
                <td className="px-3 py-2 text-slate-600">{r.reason ?? ''}</td>
              </tr>
            ))}
            {!audit.isPending && rows.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={4}>
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
