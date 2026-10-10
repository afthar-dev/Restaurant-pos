import { escapeHtml } from '@/shared/lib/escape';
import { PRINT_TIME_ZONE } from '@/shared/lib/when';

export interface KotPrintPayload {
  kind: 'KOT';
  kotNo: number;
  kotType: 'NEW' | 'CANCEL';
  stationName: string;
  orderType: 'DINE_IN' | 'PARCEL';
  tableName: string | null;
  tokenNo: number | null;
  customerName: string | null;
  waiterName: string;
  guests: number | null;
  createdAt: string;
  paperWidthMm: number;
  lines: {
    quantity: number;
    itemName: string;
    variantName: string;
    addons: string[];
    note: string | null;
    combo: { itemName: string; variantName: string; quantity: number }[];
  }[];
}

function dish(name: string, variant: string): string {
  return variant === 'Regular' ? name : `${name} (${variant})`;
}

/** A self-contained HTML page for one kitchen ticket, sized for a 58 or 80 mm thermal roll. */
export function renderKotTicket(p: KotPrintPayload): string {
  const where = p.tableName ? p.tableName : `Parcel #${p.tokenNo ?? '?'}`;
  const time = new Date(p.createdAt).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: PRINT_TIME_ZONE,
  });
  const lines = p.lines
    .map((l) => {
      const extras = [
        ...l.addons.map((a) => `<div class="sub">+ ${escapeHtml(a)}</div>`),
        ...l.combo.map(
          (c) =>
            `<div class="sub">${c.quantity * l.quantity} × ${escapeHtml(dish(c.itemName, c.variantName))}</div>`,
        ),
        l.note ? `<div class="sub note">Note: ${escapeHtml(l.note)}</div>` : '',
      ].join('');
      return `<div class="line"><div class="dish">${l.quantity} × ${escapeHtml(
        dish(l.itemName, l.variantName),
      )}</div>${extras}</div>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>KOT ${p.kotNo}</title><style>
@page { size: ${p.paperWidthMm}mm auto; margin: 2mm; }
body { width: ${p.paperWidthMm - 4}mm; margin: 0; font-family: ui-monospace, Consolas, monospace; font-size: 13px; color: #000; }
.center { text-align: center; }
.big { font-size: 20px; font-weight: 700; }
.cancel { font-size: 18px; font-weight: 700; border: 2px solid #000; padding: 2px; margin: 4px 0; }
.row { display: flex; justify-content: space-between; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
.dish { font-size: 15px; font-weight: 700; }
.sub { padding-left: 14px; }
.note { font-style: italic; }
.line { margin-bottom: 4px; }
</style></head><body>
${p.kotType === 'CANCEL' ? '<div class="center cancel">CANCELLED</div>' : ''}
<div class="center big">KOT ${p.kotNo}</div>
<div class="center">${escapeHtml(p.stationName)}</div>
<hr>
<div class="row"><span class="big">${escapeHtml(where)}</span><span>${escapeHtml(time)}</span></div>
<div class="row"><span>${escapeHtml(p.waiterName)}</span><span>${p.guests ? `Guests: ${p.guests}` : ''}</span></div>
${p.customerName ? `<div>${escapeHtml(p.customerName)}</div>` : ''}
<hr>
${lines}
<hr>
<div class="center">${p.lines.reduce((n, l) => n + l.quantity, 0)} items</div>
</body></html>`;
}
