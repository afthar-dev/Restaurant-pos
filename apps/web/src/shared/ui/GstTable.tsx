import { rupees } from '@/shared/lib/money';

export interface GstRow {
  ratePercent: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

const cell = 'px-3 py-1.5 text-right tabular-nums';

/** GST per rate for filing, with sales that carried no GST on their own last row. */
export function GstTable({ rates, exempt }: { rates: GstRow[]; exempt: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
      <table aria-label="GST by rate" className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-1.5">GST rate</th>
            <th className={cell}>Taxable</th>
            <th className={cell}>CGST</th>
            <th className={cell}>SGST</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rates.map((r) => (
            <tr key={r.ratePercent}>
              <td className="px-3 py-1.5">{`${r.ratePercent}%`}</td>
              <td className={cell}>{rupees(r.taxable)}</td>
              <td className={cell}>{rupees(r.cgst)}</td>
              <td className={cell}>{rupees(r.sgst)}</td>
            </tr>
          ))}
          {exempt > 0 && (
            <tr>
              <td className="px-3 py-1.5">No GST sales</td>
              <td className={cell}>{rupees(exempt)}</td>
              <td className={cell}>—</td>
              <td className={cell}>—</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
