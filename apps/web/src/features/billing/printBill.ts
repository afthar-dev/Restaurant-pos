import { printHtmlInIframe, renderBillTicketWithQr } from '@/features/printing';
import { fetchBillPrintPayload, queueBillPrint } from './api';

type PrintHtml = (html: string) => Promise<void>;

/** Prints the bill in this browser (no bill printer is set up). */
export async function printBillHere(
  billId: string,
  printHtml: PrintHtml = printHtmlInIframe,
  paperWidthMm: 58 | 80 = 80,
  /** The copy number this print was given; without it the latest one is used. */
  copy?: number,
): Promise<void> {
  const payload = await fetchBillPrintPayload(billId, paperWidthMm);
  await printHtml(
    await renderBillTicketWithQr(copy === undefined ? payload : { ...payload, copy }),
  );
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
  const { queued, copy } = await queueBillPrint(billId);
  if (queued > 0) return 'queued';
  await printBillHere(billId, printHtml, paperWidthMm, copy);
  return 'printed-here';
}
