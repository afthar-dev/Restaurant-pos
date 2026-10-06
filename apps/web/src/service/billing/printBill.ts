import { apiFetch } from '../../auth/api';
import { renderBillTicket, type BillPrintPayload } from '../../print/billTicket';
import { printHtmlInIframe } from '../../print/PrintWorker';

type PrintHtml = (html: string) => Promise<void>;

/** Prints the bill in this browser (no bill printer is set up). */
export async function printBillHere(
  billId: string,
  printHtml: PrintHtml = printHtmlInIframe,
  paperWidthMm: 58 | 80 = 80,
): Promise<void> {
  const payload = await apiFetch<BillPrintPayload>(
    `/api/bills/${billId}/print-payload?paperWidthMm=${paperWidthMm}`,
  );
  await printHtml(renderBillTicket(payload));
}

/**
 * Prints a bill again (the Print button): on the bill printer when one is set up (the print
 * queue takes it), otherwise right here in this browser.
 */
export async function printBill(
  billId: string,
  printHtml: PrintHtml = printHtmlInIframe,
  paperWidthMm: 58 | 80 = 80,
): Promise<'queued' | 'printed-here'> {
  const { queued } = await apiFetch<{ queued: number }>(`/api/bills/${billId}/print`, {
    method: 'POST',
  });
  if (queued > 0) return 'queued';
  await printBillHere(billId, printHtml, paperWidthMm);
  return 'printed-here';
}
