import { escapeHtml } from '@/shared/lib/escape';
import { qrSvg } from '@/shared/lib/qrSvg';

export interface TableCode {
  id: string;
  name: string;
  areaName: string;
  qrToken: string;
}

/** The address a table's sticker opens: the customer menu for that table. */
export function stickerUrl(origin: string, qrToken: string): string {
  return `${origin}/qr/?t=${encodeURIComponent(qrToken)}`;
}

/** A printable sheet of table stickers (one 6 × 8 cm card each) for an ordinary printer. */
export async function renderQrStickers(
  tables: TableCode[],
  outletName: string,
  origin: string,
): Promise<string> {
  const e = escapeHtml;
  const cards = await Promise.all(
    tables.map(async (t) => {
      const svg = await qrSvg(stickerUrl(origin, t.qrToken));
      return `<div class="card"><div class="outlet">${e(outletName)}</div><div class="table">${e(t.name)}</div><div class="qr">${svg}</div><div class="hint">Scan to see the menu and order</div></div>`;
    }),
  );
  return `<!doctype html><html><head><meta charset="utf-8"><title>Table QR stickers</title><style>
@page { size: A4; margin: 10mm; }
body { margin: 0; font-family: system-ui, sans-serif; color: #000; }
.sheet { display: flex; flex-wrap: wrap; gap: 6mm; }
.card { width: 60mm; height: 80mm; border: 1px dashed #999; box-sizing: border-box; padding: 4mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; page-break-inside: avoid; }
.outlet { font-size: 12px; }
.table { font-size: 26px; font-weight: 700; }
.qr { width: 44mm; height: 44mm; }
.qr svg { width: 100%; height: 100%; }
.hint { font-size: 11px; text-align: center; }
</style></head><body><div class="sheet">${cards.join('')}</div></body></html>`;
}
