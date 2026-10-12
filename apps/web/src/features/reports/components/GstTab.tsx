import { Receipt } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { rupees } from '@/shared/lib/money';
import { describeError, EmptyState, ErrorNote, LoadingScreen, secondaryButton } from '@/shared/ui';
import { fetchBillRegister } from '../api';
import { csvRupees, downloadCsv, toCsv } from '../csv';
import { useGstReport } from '../queries';
import type { DateRange } from '../ranges';
import type { GstReport } from '../types';

const th = 'px-3 py-2';
const num = 'px-3 py-2 text-right tabular-nums';

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

const percent = (ratePercent: number) => `${ratePercent}%`;

/** The GST summary as a small CSV: one block per section, rupees as plain numbers. */
function summaryCsv(report: GstReport): string {
  const { range, b2cByRate, exempt, sac, series, composition } = report;
  return toCsv([
    ['GST summary by invoice date', range.from, range.to],
    [],
    ['Rate', 'Taxable', 'CGST', 'SGST', 'Total'],
    ...b2cByRate.map((r) => [
      `GST ${percent(r.ratePercent)}`,
      csvRupees(r.taxable),
      csvRupees(r.cgst),
      csvRupees(r.sgst),
      csvRupees(r.total),
    ]),
    ['Exempt / No GST', csvRupees(exempt)],
    [],
    ['SAC', 'Quantity', 'Value'],
    [sac.code, sac.quantity, csvRupees(sac.value)],
    [],
    ['Financial year', 'First bill', 'Last bill', 'Bills', 'Cancelled'],
    ...series.map((s) => [s.fy, s.first, s.last, s.count, s.voided]),
    ...(composition
      ? [
          [],
          ['Composition', 'Turnover', 'Tax payable'],
          ['Composition', csvRupees(composition.turnover), csvRupees(composition.taxPayable)],
        ]
      : []),
  ]);
}

/** GST by rate, SAC and invoice series over invoice dates, with downloads for the accountant. */
export function GstTab({ range }: { range: DateRange }) {
  const report = useGstReport(range);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const data = report.data;
  if (!data) {
    return report.isError ? <ErrorNote message={describeError(report.error)} /> : <LoadingScreen />;
  }

  async function downloadRegister() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const text = await fetchBillRegister(range);
      // downloadCsv adds the BOM again.
      downloadCsv(`bill-register-${range.from}-to-${range.to}.csv`, text.replace(/^\uFEFF/, ''));
    } catch (error) {
      setDownloadError(describeError(error));
    } finally {
      setDownloading(false);
    }
  }

  const busy = report.isPlaceholderData;
  const empty = data.series.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <ErrorNote message={report.isError ? describeError(report.error) : downloadError} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={() =>
            downloadCsv(`gst-summary-${data.range.from}-to-${data.range.to}.csv`, summaryCsv(data))
          }
        >
          Download GST summary (CSV)
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy || downloading}
          onClick={() => void downloadRegister()}
        >
          Download bill register (CSV)
        </button>
      </div>
      {empty ? (
        <EmptyState
          icon={<Receipt />}
          title="No bills on these dates"
          description="Bills are filed by the date they were made. Pick other dates."
        />
      ) : (
        <>
          <p className="text-sm text-muted">
            Bills are filed by invoice date (India time), not by business day. Cancelled bills are
            counted in the invoice series only.
          </p>
          <h2 className="text-lg font-semibold">B2C sales by rate</h2>
          {data.b2cByRate.length === 0 ? (
            <p className="text-sm text-muted">No sales with GST in these dates.</p>
          ) : (
            <Table
              label="B2C sales by GST rate"
              head={['Rate', 'Taxable', 'CGST', 'SGST', 'Total']}
              textColumns={1}
            >
              {data.b2cByRate.map((r) => (
                <tr key={r.ratePercent}>
                  <td className={th}>{percent(r.ratePercent)}</td>
                  <td className={num}>{rupees(r.taxable)}</td>
                  <td className={num}>{rupees(r.cgst)}</td>
                  <td className={num}>{rupees(r.sgst)}</td>
                  <td className={num}>{rupees(r.total)}</td>
                </tr>
              ))}
            </Table>
          )}
          <dl className="flex items-baseline justify-between rounded-lg border border-border bg-surface px-4 py-3 shadow-card">
            <dt className="text-sm font-medium">Exempt / No GST</dt>
            <dd className="tabular-nums">{rupees(data.exempt)}</dd>
          </dl>
          {data.composition && (
            <>
              <h2 className="text-lg font-semibold">Composition</h2>
              <Table label="Composition" head={['Turnover', 'Tax payable']} textColumns={0}>
                <tr>
                  <td className={num}>{rupees(data.composition.turnover)}</td>
                  <td className={num}>{rupees(data.composition.taxPayable)}</td>
                </tr>
              </Table>
            </>
          )}
          <h2 className="text-lg font-semibold">HSN / SAC</h2>
          <Table label="HSN / SAC" head={['SAC', 'Quantity', 'Value']} textColumns={1}>
            <tr>
              <td className={th}>{data.sac.code}</td>
              <td className={num}>{data.sac.quantity}</td>
              <td className={num}>{rupees(data.sac.value)}</td>
            </tr>
          </Table>
          <h2 className="text-lg font-semibold">Invoice series</h2>
          <Table
            label="Invoice series"
            head={['Financial year', 'First bill', 'Last bill', 'Bills', 'Cancelled']}
            textColumns={1}
          >
            {data.series.map((s) => (
              <tr key={s.fy}>
                <td className={th}>{s.fy}</td>
                <td className={num}>{s.first}</td>
                <td className={num}>{s.last}</td>
                <td className={num}>{s.count}</td>
                <td className={num}>{s.voided}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
