import { rupees } from '@/shared/lib/money';
import type { OrderRequest } from '../types';

const TONE: Record<OrderRequest['status'], string> = {
  PENDING: 'border-amber-300 bg-amber-50 text-amber-950',
  APPROVED: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  REJECTED: 'border-red-300 bg-red-50 text-red-900',
};

/** What this phone has sent and what the staff decided. */
export function Requests({ requests }: { requests: OrderRequest[] }) {
  if (requests.length === 0) return null;
  return (
    <section aria-label="Your orders" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Your orders</h2>
      {requests.map((r) => (
        <article key={r.id} className={`rounded-xl border p-3 ${TONE[r.status]}`}>
          <p className="font-semibold">{r.message}</p>
          <ul className="mt-1 text-sm">
            {r.lines.map((l, index) => (
              <li key={index}>
                {l.quantity} ×{' '}
                {l.variantName === 'Regular' ? l.itemName : `${l.itemName} (${l.variantName})`}
                {l.addons.length > 0 && ` + ${l.addons.join(', ')}`}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm">{rupees(r.total)} approx.</p>
        </article>
      ))}
    </section>
  );
}
