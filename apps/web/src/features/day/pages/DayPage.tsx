import { parseRupees } from '@rpos/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useCan } from '@/shared/session/store';
import {
  ConfirmBar,
  dangerButton,
  describeError,
  EmptyState,
  ErrorNote,
  Field,
  GstTable,
  inputClass,
  PageHeader,
  PaymentIcon,
  primaryButton,
  secondaryButton,
} from '@/shared/ui';
import { renderDayReport } from '../dayReport';
import { printHtmlInIframe } from '@/features/printing';
import { useOutlet } from '@/features/settings';
import { useCloseDay, useRefreshDays, useReopenDay } from '../mutations';
import { useBusinessDay, useCloseCheck, useDayReport, usePastDays } from '../queries';
import type { DayBlockers, DayReport, DaySummary } from '../types';
import { rupees } from '@/shared/lib/money';
import { ChevronRight, Sunrise } from 'lucide-react';
import { Link } from 'react-router';

const signed = (paise: number) =>
  paise < 0 ? `−${rupees(-paise)}` : paise > 0 ? `+${rupees(paise)}` : rupees(0);

/** "Tue, 6 Oct, 9:00 am" in India time. */
const openedLabel = (iso: string) => {
  const at = new Date(iso);
  const date = at.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const time = at.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  return `${date}, ${time}`;
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const ORDER_STATE: Record<string, string> = {
  OPEN: 'order still open',
  BILLED: 'bill printed, not paid',
  PENDING_APPROVAL: 'waiting for approval',
};

const PAY_LABEL = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' } as const;

function PayLabel({ mode }: { mode: keyof typeof PAY_LABEL }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PaymentIcon mode={mode} className="text-muted" />
      {PAY_LABEL[mode]}
    </span>
  );
}

function Row({ label, value, strong }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      {children}
    </div>
  );
}

/** One line per order: an order with an unpaid bill says what is due rather than appearing twice. */
function blockerLines(blockers: DayBlockers) {
  const lines = blockers.orders.map((o) => {
    const bill = blockers.bills.find((b) => b.orderId === o.id);
    return {
      key: o.id,
      orderId: o.id,
      text: bill
        ? `${o.label}: bill ${bill.billNo}, ${rupees(bill.due)} due`
        : `${o.label}: ${ORDER_STATE[o.status] ?? 'order still open'}`,
    };
  });
  for (const b of blockers.bills) {
    if (!blockers.orders.some((o) => o.id === b.orderId)) {
      lines.push({ key: b.id, orderId: b.orderId, text: `Bill ${b.billNo}: ${rupees(b.due)} due` });
    }
  }
  return lines;
}

function Blockers({ blockers }: { blockers: DayBlockers }) {
  if (blockers.orders.length === 0 && blockers.bills.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-medium text-amber-900">Finish these before closing the day:</p>
      <ul aria-label="Still open" className="mt-1 flex flex-col">
        {blockerLines(blockers).map((line) => (
          <li key={line.key}>
            <Link
              to={`/pos?order=${line.orderId}`}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-amber-950 underline-offset-4 hover:underline"
            >
              {line.text}
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CloseToday({ onClosed }: { onClosed: (report: DayReport) => void }) {
  const id = useId();
  const check = useCloseCheck();
  const openDay = useBusinessDay().data?.day;
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCloseDay({
    onClosed: (report) => {
      setConfirming(false);
      onClosed(report);
    },
    // Blockers found by the server show in the list above, not as an error.
    onFailed: (failure, blocked) => {
      setConfirming(false);
      if (!blocked) setError(describeError(failure));
    },
  });

  if (!check.data) {
    return check.isError ? <ErrorNote message={describeError(check.error)} /> : null;
  }
  const blockers = check.data.blockers;
  const blocked = blockers.orders.length > 0 || blockers.bills.length > 0;
  const { cash } = check.data;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (parseRupees(counted.trim()) === null) {
      return setError('Enter the cash you counted, like 1032.');
    }
    setError(null);
    setConfirming(true);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          Close the business day
        </h2>
        {openDay && (
          <p className="text-sm text-muted">
            {`Opened ${openedLabel(openDay.openedAt)} by ${openDay.openedBy.name}`}
          </p>
        )}
      </div>
      <Blockers blockers={blockers} />
      <Block title="Cash in the drawer">
        <Row label="Opening" value={rupees(cash.opening)} />
        <Row label="Cash sales" value={rupees(cash.cashSales)} />
        {cash.cashRefunds > 0 && <Row label="Cash refunded" value={rupees(cash.cashRefunds)} />}
        <Row label="Cash expenses" value={rupees(cash.cashExpenses)} />
        <Row label="Expected in drawer" value={rupees(cash.expected)} strong />
      </Block>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`${id}-counted`} label="Counted cash (₹)">
            <input
              id={`${id}-counted`}
              inputMode="decimal"
              className={inputClass}
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
            />
          </Field>
          <Field id={`${id}-note`} label="Note">
            <input
              id={`${id}-note`}
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <ErrorNote message={error} />
        {confirming ? (
          <ConfirmBar
            question="Close the day? New orders will be blocked until a manager opens the next day."
            confirmLabel="Yes, close the day"
            onConfirm={() =>
              close.mutate({
                countedCash: parseRupees(counted.trim())!,
                ...(note.trim() ? { note: note.trim() } : {}),
              })
            }
            onCancel={() => setConfirming(false)}
            busy={close.isPending}
          />
        ) : (
          <button
            type="submit"
            className={`${primaryButton} min-h-12 self-start text-base`}
            disabled={blocked}
          >
            Close day
          </button>
        )}
      </form>
    </section>
  );
}

function ReportView({
  report,
  latest,
  onReopened,
}: {
  report: DayReport;
  latest: boolean;
  onReopened: () => void;
}) {
  const id = useId();
  const canReopen = useCan('day.reopen');
  const outlet = useOutlet();
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const reopen = useReopenDay(report.day.id, onReopened);
  const { sales, cash } = report;

  return (
    <section aria-label="Day report" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Day report · {shortDate(report.day.openedAt)}
          {report.day.status === 'OPEN' && ' (still open)'}
        </h2>
        <button
          type="button"
          className={`${secondaryButton} min-h-11`}
          onClick={() => void printHtmlInIframe(renderDayReport(report, outlet.data?.name ?? ''))}
        >
          Print report
        </button>
      </div>
      {report.reopened && (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          {`Reopened by ${report.reopened.by ?? 'unknown'} · ${openedLabel(report.reopened.at)}`}
          {report.reopened.earlier.counted !== null &&
            ` — earlier close: counted ${rupees(report.reopened.earlier.counted)}, variance ${signed(report.reopened.earlier.variance ?? 0)}`}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Block title="Sales">
          <Row label="Bills" value={String(sales.bills)} />
          <Row label="Gross" value={rupees(sales.grossSubtotal)} />
          <Row label="Discounts" value={rupees(sales.discounts)} />
          <Row label="Packaging" value={rupees(sales.packaging)} />
          <Row label="Taxable" value={rupees(sales.taxable)} />
          <Row label="CGST" value={rupees(sales.cgst)} />
          <Row label="SGST" value={rupees(sales.sgst)} />
          <Row label="Total" value={rupees(sales.total)} strong />
          <Row label="Collected" value={rupees(sales.collected)} />
          {sales.unpaid > 0 && <Row label="Unpaid" value={rupees(sales.unpaid)} />}
          {(sales.gstBreakup.length > 0 || sales.exempt > 0) && (
            <GstTable rates={sales.gstBreakup} exempt={sales.exempt} />
          )}
        </Block>
        <Block title="Payments">
          <Row label={<PayLabel mode="CASH" />} value={rupees(report.payments.CASH)} />
          <Row label={<PayLabel mode="UPI" />} value={rupees(report.payments.UPI)} />
          <Row label={<PayLabel mode="CARD" />} value={rupees(report.payments.CARD)} />
          <p className="pt-1 text-muted">
            {`Dine-in · ${report.byType.DINE_IN.orders} orders · ${rupees(report.byType.DINE_IN.total)}`}
          </p>
          <p className="text-muted">
            {`Parcel · ${report.byType.PARCEL.orders} orders · ${rupees(report.byType.PARCEL.total)}`}
          </p>
        </Block>
        <Block title="Cash">
          <Row label="Opening" value={rupees(cash.opening)} />
          <Row label="Cash sales" value={rupees(cash.cashSales)} />
          {cash.cashRefunds > 0 && <Row label="Cash refunded" value={rupees(cash.cashRefunds)} />}
          <Row label="Cash expenses" value={rupees(cash.cashExpenses)} />
          <Row label="Expected in drawer" value={rupees(cash.expected)} strong />
          {cash.counted !== null && <Row label="Counted" value={rupees(cash.counted)} />}
          {cash.variance !== null && (
            <div
              className={`flex justify-between gap-2 font-semibold ${
                cash.variance === 0 ? '' : 'text-red-700'
              }`}
            >
              <span>Variance</span>
              <span className="tabular-nums">{signed(cash.variance)}</span>
            </div>
          )}
          {report.day.closeNote && <p className="text-muted">Note: {report.day.closeNote}</p>}
        </Block>
        <Block title="Top items">
          {report.topItems.length === 0 && <p className="text-subtle">No sales.</p>}
          {report.topItems.map((i) => (
            <div key={`${i.itemName}-${i.variantName}`} className="flex justify-between gap-2">
              <span>
                {i.quantity} ×{' '}
                <span>
                  {i.variantName === 'Regular' ? i.itemName : `${i.itemName} (${i.variantName})`}
                </span>
              </span>
              <span className="tabular-nums">{rupees(i.amount)}</span>
            </div>
          ))}
        </Block>
        {report.refunds.total > 0 && (
          <Block title="Refunds">
            <Row label="Total refunded" value={rupees(report.refunds.total)} strong />
            {(['CASH', 'UPI', 'CARD'] as const)
              .filter((mode) => report.refunds[mode] > 0)
              .map((mode) => (
                <Row
                  key={mode}
                  label={<PayLabel mode={mode} />}
                  value={rupees(report.refunds[mode])}
                />
              ))}
            {report.refunds.bills.map((b) => (
              <Row
                key={b.billNo}
                label={`Bill ${b.billNo} · ${b.modes.map((m) => PAY_LABEL[m]).join(', ')}${b.by ? ` · ${b.by}` : ''}`}
                value={rupees(b.amount)}
              />
            ))}
          </Block>
        )}
        {report.reprints.length > 0 && (
          <Block title="Reprinted bills">
            {report.reprints.map((b) => (
              <Row key={b.billNo} label={`Bill ${b.billNo}`} value={`Reprinted ${b.count}×`} />
            ))}
          </Block>
        )}
        {report.voids.length > 0 && (
          <Block title="Voided bills">
            {report.voids.map((v) => (
              <Row
                key={v.billNo}
                label={`Bill ${v.billNo}${v.reason ? ` · ${v.reason}` : ''}${v.by ? ` · ${v.by}` : ''}`}
                value={rupees(v.total)}
              />
            ))}
          </Block>
        )}
        {report.cancels.length > 0 && (
          <Block title="Cancelled dishes">
            {report.cancels.map((c, index) => (
              <Row key={index} label={`${c.quantity} × ${c.itemName}`} value={c.reason ?? ''} />
            ))}
          </Block>
        )}
        {report.discounts.length > 0 && (
          <Block title="Discounts">
            {report.discounts.map((d) => (
              <Row
                key={d.billNo}
                label={`Bill ${d.billNo}${d.reason ? ` · ${d.reason}` : ''}`}
                value={rupees(d.amount)}
              />
            ))}
          </Block>
        )}
      </div>
      {canReopen && latest && report.day.status === 'CLOSED' && (
        <div className="flex flex-col gap-2">
          {reopening ? (
            <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <Field id={`${id}-reason`} label="Why reopen?">
                <input
                  id={`${id}-reason`}
                  className={inputClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <ErrorNote message={reopen.isError ? describeError(reopen.error) : null} />
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`${dangerButton} min-h-11`}
                  disabled={reason.trim().length < 3 || reopen.isPending}
                  onClick={() => reopen.mutate(reason.trim())}
                >
                  Yes, reopen
                </button>
                <button
                  type="button"
                  className={`${secondaryButton} min-h-11`}
                  onClick={() => setReopening(false)}
                >
                  Keep it closed
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${secondaryButton} min-h-11 self-start`}
              onClick={() => setReopening(true)}
            >
              Reopen day
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function PastDays({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (day: DaySummary, latest: boolean) => void;
}) {
  const days = usePastDays();
  if (!days.data || days.data.length === 0) return null;
  return (
    <section aria-label="Past days" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Days</h2>
      <ul className="flex flex-col gap-1">
        {days.data.map((d, index) => (
          <li key={d.id}>
            <button
              type="button"
              aria-pressed={selected === d.id}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-left text-sm"
              onClick={() => onSelect(d, index === 0)}
            >
              <span>
                {`${shortDate(d.openedAt)} · ${rupees(d.total)}`}
                {d.unpaid > 0 && ` · Unpaid ${rupees(d.unpaid)}`}
              </span>
              <span className={d.variance ? 'text-red-700' : 'text-subtle'}>
                {d.status === 'OPEN'
                  ? 'Open'
                  : d.variance === null
                    ? ''
                    : `Variance ${signed(d.variance)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Close the business day with a cash count (spec §5.5), read day reports, reopen (owner). */
export function DayPage() {
  const refreshDays = useRefreshDays();
  const canClose = useCan('day.openClose');
  const canReports = useCan('reports.dayClose');
  const day = useBusinessDay();
  const [justClosed, setJustClosed] = useState<DayReport | null>(null);
  const [picked, setPicked] = useState<{ id: string; latest: boolean } | null>(null);
  const report = useDayReport(picked?.id);

  const shown = justClosed ?? (picked ? report.data : undefined);
  const open = day.data?.day;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Day close"
        description="Settle every table, count the cash in the drawer and close the day. Past day reports are below."
      />
      {canClose && open && !justClosed && <CloseToday onClosed={setJustClosed} />}
      {canClose && day.data && !open && !justClosed && (
        <EmptyState
          icon={<Sunrise />}
          title="No business day is open"
          description="Open the day from the POS screen to start taking orders. Closed days are listed below."
        />
      )}
      {shown && (
        <ReportView
          report={shown}
          latest={justClosed ? true : (picked?.latest ?? false)}
          onReopened={() => {
            setJustClosed(null);
            setPicked(null);
            void refreshDays();
          }}
        />
      )}
      {picked && report.isError && <ErrorNote message={describeError(report.error)} />}
      {canReports && (
        <PastDays
          selected={picked?.id ?? null}
          onSelect={(d, latest) => {
            setJustClosed(null);
            setPicked({ id: d.id, latest });
          }}
        />
      )}
    </section>
  );
}
