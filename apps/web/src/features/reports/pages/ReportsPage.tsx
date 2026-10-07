import { useState } from 'react';
import { describeError, ErrorNote, LoadingScreen, secondaryButton } from '@/shared/ui';
import { CategoriesTable, DaysTable, ItemsTable } from '../components/ReportTables';
import { RangePicker } from '../components/RangePicker';
import { SummaryCards } from '../components/SummaryCards';
import { csvRupees, downloadCsv, toCsv } from '../csv';
import { useSalesReport } from '../queries';
import { dateLabel, presetRange, type DateRange } from '../ranges';
import type { SalesReport } from '../types';

const fileRange = (report: SalesReport) => `${report.range.from}-to-${report.range.to}`;

/** One file per click: browsers block a second automatic download. */
function downloadDays(report: SalesReport) {
  downloadCsv(
    `sales-days-${fileRange(report)}.csv`,
    toCsv([
      ['Date', 'Bills', 'Sales', 'Cash', 'UPI', 'Card', 'Expenses'],
      ...report.days.map((d) => [
        d.date,
        d.bills,
        csvRupees(d.total),
        csvRupees(d.cash),
        csvRupees(d.upi),
        csvRupees(d.card),
        csvRupees(d.expenses),
      ]),
    ]),
  );
}

function downloadDishes(report: SalesReport) {
  downloadCsv(
    `sales-dishes-${fileRange(report)}.csv`,
    toCsv([
      ['Dish', 'Size', 'Quantity', 'Amount'],
      ...report.items.map((i) => [i.itemName, i.variantName, i.quantity, csvRupees(i.amount)]),
    ]),
  );
}

/** Sales over a date range for the owner, with CSV export for the accountant. */
export function ReportsPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('today'));
  const report = useSalesReport(range);
  const data = report.data;

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Sales report</h1>
        <div className="flex gap-2">
          {(
            [
              ['Days CSV', downloadDays],
              ['Dishes CSV', downloadDishes],
            ] as const
          ).map(([label, download]) => (
            <button
              key={label}
              type="button"
              className={secondaryButton}
              disabled={!data || report.isPlaceholderData}
              onClick={() => data && download(data)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <RangePicker range={range} onChange={setRange} />
      <p className="text-sm text-slate-600">
        {range.from === range.to
          ? dateLabel(range.from)
          : `${dateLabel(range.from)} – ${dateLabel(range.to)}`}
        {report.isFetching && ' · updating…'}
      </p>
      <ErrorNote message={report.isError ? describeError(report.error) : null} />
      {!data ? (
        !report.isError && <LoadingScreen />
      ) : (
        <>
          <SummaryCards summary={data.summary} />
          {data.days.length === 0 ? (
            <p className="text-slate-600">No business days in this range.</p>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Days</h2>
              <DaysTable days={data.days} />
              <h2 className="text-lg font-semibold">Dishes</h2>
              <ItemsTable items={data.items} />
              <h2 className="text-lg font-semibold">Categories</h2>
              <CategoriesTable categories={data.categories} />
            </>
          )}
        </>
      )}
    </section>
  );
}
