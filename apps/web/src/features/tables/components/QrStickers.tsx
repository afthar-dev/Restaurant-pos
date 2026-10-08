import { useState } from 'react';
import { useOutlet } from '@/features/settings';
import { ConfirmBar, describeError, ErrorNote, secondaryButton } from '@/shared/ui';
import { printHtmlInIframe, renderQrStickers, type TableCode } from '@/features/printing';

import { useRotateTableCode } from '../mutations';
import { useTableCodes } from '../queries';

/** Print the table QR stickers customers scan to order, and replace a lost or copied one. */
export function QrStickers() {
  const codes = useTableCodes();
  const outlet = useOutlet();
  const [confirming, setConfirming] = useState<TableCode | null>(null);
  const [renewed, setRenewed] = useState<TableCode | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

  async function print(tables: TableCode[]) {
    setPrintError(null);
    try {
      const html = await renderQrStickers(tables, outlet.data?.name ?? '', window.location.origin);
      await printHtmlInIframe(html);
    } catch (error) {
      setPrintError(`Could not print: ${describeError(error)}`);
    }
  }

  const rotate = useRotateTableCode((table) => {
    setConfirming(null);
    setRenewed(table);
  });

  const tables = codes.data ?? [];
  return (
    <section
      aria-label="QR stickers"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">QR stickers</h3>
          <p className="text-sm text-muted">
            Customers scan the sticker on their table to see the menu and send an order for the
            staff to approve.
          </p>
        </div>
        <button
          type="button"
          className={`${secondaryButton} min-h-11`}
          disabled={tables.length === 0}
          onClick={() => void print(tables)}
        >
          Print all stickers
        </button>
      </div>
      {confirming && (
        <ConfirmBar
          question={`Replace the QR code for ${confirming.name}? The old sticker stops working at once.`}
          confirmLabel={`Yes, new code for ${confirming.name}`}
          onConfirm={() => rotate.mutate(confirming)}
          onCancel={() => setConfirming(null)}
          busy={rotate.isPending}
        />
      )}
      {renewed && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-green-800">
          <span>{`${renewed.name} has a new QR code.`}</span>
          <button
            type="button"
            className={`${secondaryButton} min-h-11`}
            onClick={() => void print([renewed])}
          >
            Print the new sticker
          </button>
        </div>
      )}
      <ErrorNote message={rotate.isError ? describeError(rotate.error) : null} />
      <ErrorNote message={printError} />
      <ul className="flex flex-wrap gap-2">
        {tables.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              aria-label={`New QR code for ${t.name}`}
              className="min-h-11 rounded-md border border-border px-3 text-sm"
              onClick={() => {
                setRenewed(null);
                setConfirming(t);
              }}
            >
              {t.name} · new code
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
