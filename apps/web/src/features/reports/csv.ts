/** `raw` is written as is, unquoted: used for numbers that must keep their exact digits. */
export type Cell = string | number | { raw: string };

/**
 * One CSV cell. Text is always quoted with `"` doubled. Text that a spreadsheet would run as a
 * formula (starting with = + - @, a tab or a carriage return) gets a leading `'`, so a dish or
 * category name cannot execute anything when the accountant opens the file.
 */
export function csvCell(value: Cell): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return value.raw;
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Rows joined with CRLF, as Excel expects. */
export function toCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Paise as plain rupees for spreadsheets: 117050 → 1170.50. */
export const csvRupees = (paise: number) => Number((paise / 100).toFixed(2));

/** Paise as rupees with fixed 2 decimals (like the bill register): 117050 → 1170.50, 3200 → 32.00. */
export const csvMoney = (paise: number): Cell => ({ raw: (paise / 100).toFixed(2) });

/** Saves `content` as a file in the browser. */
export function downloadCsv(filename: string, content: string): void {
  // The BOM makes Excel read ₹ and Indian names as UTF-8.
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
