import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiFetch } from '../auth/api';
import { POLL_MS } from '../service/queries';
import { renderKotTicket, type KotPrintPayload } from './kotTicket';

interface PrintJob {
  id: string;
  kind: 'KOT' | 'BILL';
  payload: KotPrintPayload;
  attempts: number;
}

/**
 * Prints `html` through a hidden iframe. With Chrome started using --kiosk-printing the page
 * goes straight to the default printer without a dialog.
 */
export function printHtmlInIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
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

/**
 * Runs on any browser that is a registered device. Prints this device's waiting jobs one at a
 * time and reports each back; the server stops offering a job after three failed attempts.
 */
export function PrintWorker({
  printHtml = printHtmlInIframe,
}: {
  printHtml?: (html: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const jobs = useQuery({
    queryKey: ['print-jobs'],
    queryFn: () => apiFetch<PrintJob[]>('/api/print/jobs', { skipRefresh: true }),
    refetchInterval: POLL_MS,
  });

  useEffect(() => {
    if (busy.current || !jobs.data || jobs.data.length === 0) return;
    busy.current = true;
    void (async () => {
      for (const job of jobs.data) {
        let ok = true;
        try {
          if (job.kind !== 'KOT') throw new Error(`Unknown print job ${job.kind}`);
          await printHtml(renderKotTicket(job.payload));
        } catch {
          ok = false;
        }
        await apiFetch(`/api/print/jobs/${job.id}/done`, {
          method: 'POST',
          body: { ok },
          skipRefresh: true,
        }).catch(() => undefined);
      }
      busy.current = false;
      await queryClient.invalidateQueries({ queryKey: ['print-jobs'] });
    })();
  }, [jobs.data, printHtml, queryClient]);

  return null;
}
