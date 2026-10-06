import { parseRupees } from '@rpos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, apiFetch } from '../auth/api';
import { useCan } from '../auth/store';
import {
  ConfirmBar,
  dangerButton,
  describeError,
  ErrorNote,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from '../components/ui';
import { renderDayReport } from '../print/dayReport';
import { printHtmlInIframe } from '../print/PrintWorker';
import { useBusinessDay } from '../service/queries';
import type { CloseCheck, DayBlockers, DayReport, DaySummary } from '../service/types';
import { rupees } from './admin/menu-types';

const signed = (paise: number) =>
  paise < 0 ? `−${rupees(-paise)}` : paise > 0 ? `+${rupees(paise)}` : rupees(0);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const ORDER_STATE: Record<string, string> = {
  OPEN: 'order open',
  BILLED: 'bill printed, not paid',
  PENDING_APPROVAL: 'waiting for approval',
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

function Blockers({ blockers }: { blockers: DayBlockers }) {
  if (blockers.orders.length === 0 && blockers.bills.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-medium text-amber-900">Finish these before closing the day:</p>
      <ul aria-label="Still open" className="mt-1 list-disc pl-5">
        {blockers.orders.map((o) => (
          <li key={o.id}>{`${o.label} — ${ORDER_STATE[o.status] ?? 'open'}`}</li>
        ))}
        {blockers.bills.map((b) => (
          <li key={b.id}>{`Bill ${b.billNo} — ${rupees(b.due)} due`}</li>
        ))}
      </ul>
    </div>
  );
}

function CloseToday({ onClosed }: { onClosed: (report: DayReport) => void }) {
  const id = useId();
  const queryClient = useQueryClient();
  const check = useQuery({
    queryKey: ['close-check'],
    queryFn: () => apiFetch<CloseCheck>('/api/business-day/close-check'),
    refetchInterval: 15_000,
  });
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [refused, setRefused] = useState<DayBlockers | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useMutation({
    mutationFn: (body: { countedCash: number; note?: string }) =>
      apiFetch<DayReport>('/api/business-day/close', { method: 'POST', body }),
    onSuccess: async (report) => {
      setConfirming(false);
      onClosed(report);
      await queryClient.invalidateQueries({ queryKey: ['business-day'] });
      await queryClient.invalidateQueries({ queryKey: ['days'] });
    },
    onError: (failure) => {
      setConfirming(false);
      if (failure instanceof ApiError && failure.code === 'DAY_HAS_OPEN_WORK') {
        setRefused(failure.body.blockers as DayBlockers);
        void check.refetch();
      } else {
        setError(describeError(failure));
      }
    },
  });

  if (!check.data) {
    return check.isError ? <ErrorNote message={describeError(check.error)} /> : null;
  }
  const blockers = refused ?? check.data.blockers;
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
    <section aria-label="Close today" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Close today</h2>
      <Blockers blockers={blockers} />
      <Block title="Cash in the drawer">
        <Row label="Opening" value={rupees(cash.opening)} />
        <Row label="Cash sales" value={rupees(cash.cashSales)} />
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
  const outlet = useQuery({
    queryKey: ['outlet'],
    queryFn: () => apiFetch<{ name: string }>('/api/outlet'),
  });
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');
  const reopen = useMutation({
    mutationFn: () =>
      apiFetch(`/api/business-day/${report.day.id}/reopen`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: onReopened,
  });
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
      <div className="grid gap-3 md:grid-cols-2">
        <Block title="Sales">
          <Row label="Bills" value={String(sales.bills)} />
          <Row label="Gross" value={rupees(sales.grossSubtotal)} />
          <Row label="Discounts" value={rupees(sales.discounts)} />
          <Row label="Packaging" value={rupees(sales.packaging)} />
          <Row label="CGST" value={rupees(sales.cgst)} />
          <Row label="SGST" value={rupees(sales.sgst)} />
          <Row label="Total" value={rupees(sales.total)} strong />
        </Block>
        <Block title="Payments">
          <Row label="Cash" value={rupees(report.payments.CASH)} />
          <Row label="UPI" value={rupees(report.payments.UPI)} />
          <Row label="Card" value={rupees(report.payments.CARD)} />
          <p className="pt-1 text-slate-600">
            {`Dine-in · ${report.byType.DINE_IN.orders} orders · ${rupees(report.byType.DINE_IN.total)}`}
          </p>
          <p className="text-slate-600">
            {`Parcel · ${report.byType.PARCEL.orders} orders · ${rupees(report.byType.PARCEL.total)}`}
          </p>
        </Block>
        <Block title="Cash">
          <Row label="Opening" value={rupees(cash.opening)} />
          <Row label="Cash sales" value={rupees(cash.cashSales)} />
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
          {report.day.closeNote && <p className="text-slate-600">Note: {report.day.closeNote}</p>}
        </Block>
        <Block title="Top items">
          {report.topItems.length === 0 && <p className="text-slate-500">No sales.</p>}
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
                  onClick={() => reopen.mutate()}
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
  const days = useQuery({
    queryKey: ['days'],
    queryFn: () => apiFetch<DaySummary[]>('/api/business-day?limit=30'),
  });
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
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm"
              onClick={() => onSelect(d, index === 0)}
            >
              <span>{`${shortDate(d.openedAt)} · ${rupees(d.total)}`}</span>
              <span className={d.variance ? 'text-red-700' : 'text-slate-500'}>
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
  const queryClient = useQueryClient();
  const canClose = useCan('day.openClose');
  const canReports = useCan('reports.dayClose');
  const day = useBusinessDay();
  const [justClosed, setJustClosed] = useState<DayReport | null>(null);
  const [picked, setPicked] = useState<{ id: string; latest: boolean } | null>(null);
  const report = useQuery({
    queryKey: ['day-report', picked?.id],
    queryFn: () => apiFetch<DayReport>(`/api/business-day/${picked!.id}/report`),
    enabled: Boolean(picked),
  });

  const shown = justClosed ?? (picked ? report.data : undefined);
  const open = day.data?.day;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-5">
      <h1 className="text-2xl font-semibold">Day close</h1>
      {canClose && open && !justClosed && <CloseToday onClosed={setJustClosed} />}
      {canClose && day.data && !open && !justClosed && (
        <p className="text-slate-600">No business day is open.</p>
      )}
      {shown && (
        <ReportView
          report={shown}
          latest={justClosed ? true : (picked?.latest ?? false)}
          onReopened={() => {
            setJustClosed(null);
            setPicked(null);
            void queryClient.invalidateQueries({ queryKey: ['business-day'] });
            void queryClient.invalidateQueries({ queryKey: ['days'] });
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
