import type { PrinterMode, PrinterPurpose } from '@rpos/shared';

export interface Station {
  id: string;
  name: string;
  archivedAt: string | null;
}

export interface Printer {
  id: string;
  name: string;
  purpose: PrinterPurpose;
  station: { id: string; name: string } | null;
  mode: PrinterMode;
  paperWidthMm: number;
  address: string | null;
  device: { id: string; name: string } | null;
}
