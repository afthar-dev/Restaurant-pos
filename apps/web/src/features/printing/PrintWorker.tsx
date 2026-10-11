import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ApiError } from '@/shared/api/http';
import { reportPrintJob, type PrintJob } from './api';
import { useClaimedPrintJobs } from './queries';
import { printKeys } from './keys';
import { renderBillTicketWithQr } from './templates/billTicket';
import { renderKotTicket } from './templates/kotTicket';

async function renderJob(job: PrintJob): Promise<string> {
  if (job.kind === 'KOT') return renderKotTicket(job.payload);
  if (job.kind === 'BILL') return renderBillTicketWithQr(job.payload);
  throw new Error(`Unknown print job ${(job as { kind: string }).kind}`);
}

/**
 * Prints `html` through a hidden iframe. With Chrome started using --kiosk-printing the page
 * goes straight to the default printer without a dialog.
 */
export function printHtmlInIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    // The ticket needs no scripts; allow-modals keeps print() working, allow-same-origin
    // lets this page call it.
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.onload = () => {
      try {
        frame.contentWindow!.focus();
        frame.contentWindow!.print();
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        setTimeout(() => frame.remove(), 1000);
      }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

const OUTCOMES_KEY = 'rpos.print.unreported';

/**
 * Prints that happened but whose result has not reached the server yet. Kept in
 * localStorage so a lost acknowledgement (Wi-Fi blip, reload) is retried instead of the
 * ticket being printed again.
 */
function loadOutcomes(): Map<string, boolean> {
  try {
    const raw = localStorage.getItem(OUTCOMES_KEY);
    return new Map(raw ? (JSON.parse(raw) as [string, boolean][]) : []);
  } catch {
    return new Map();
  }
}

function saveOutcomes(outcomes: Map<string, boolean>) {
  try {
    localStorage.setItem(OUTCOMES_KEY, JSON.stringify([...outcomes]));
  } catch {
    // Storage blocked: acknowledgements are still retried while this tab stays open.
  }
}

/**
 * Runs on any browser that is a registered device. Claims this device's waiting jobs (the
 * server leases each job to one claimer, so a second tab never prints it too), prints them
 * one at a time and reports each result, retrying the report rather than the print.
 */
export function PrintWorker({
  printHtml = printHtmlInIframe,
}: {
  printHtml?: (html: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const outcomes = useRef<Map<string, boolean> | null>(null);
  const jobs = useClaimedPrintJobs();

  useEffect(() => {
    if (busy.current || !jobs.data) return;
    busy.current = true;
    const unreported = (outcomes.current ??= loadOutcomes());

    async function report(jobId: string, ok: boolean) {
      try {
        await reportPrintJob(jobId, ok);
      } catch (error) {
        // 404/409: the job is gone or already settled, so there is nothing left to report.
        // Anything else (offline, server error): keep the result and retry next round.
        const settled = error instanceof ApiError && (error.status === 404 || error.status === 409);
        if (!settled) return;
      }
      unreported.delete(jobId);
      saveOutcomes(unreported);
    }

    void (async () => {
      try {
        const printed = new Set(unreported.keys());
        for (const [jobId, ok] of [...unreported]) await report(jobId, ok);
        for (const job of jobs.data) {
          if (printed.has(job.id)) continue;
          let ok = true;
          try {
            await printHtml(await renderJob(job));
          } catch {
            ok = false;
          }
          unreported.set(job.id, ok);
          saveOutcomes(unreported);
          await report(job.id, ok);
        }
      } finally {
        busy.current = false;
      }
      if (jobs.data.length > 0) await queryClient.invalidateQueries({ queryKey: printKeys.jobs });
    })();
  }, [jobs.data, jobs.dataUpdatedAt, printHtml, queryClient]);

  return null;
}
