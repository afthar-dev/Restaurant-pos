import { Download, Printer, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOutlet } from '@/features/settings';
import { Button, ConfirmBar, describeError, Dialog, ErrorNote, secondaryButton } from '@/shared/ui';
import {
  printHtmlInIframe,
  renderQrStickers,
  stickerUrl,
  type TableCode,
} from '@/features/printing';

import { useRotateTableCode } from '../mutations';
import { useTableCodes } from '../queries';
import { fileSafe, qrPng, qrSvg, saveBlob, zipFiles } from '../qrImages';

/** A table's QR code drawn on screen, named for screen readers. */
function QrImage({ table, className }: { table: TableCode; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void qrSvg(stickerUrl(window.location.origin, table.qrToken)).then((s) => {
      if (live) setSvg(s);
    });
    return () => {
      live = false;
    };
  }, [table.qrToken]);
  return (
    <div
      role="img"
      aria-label={`QR code for ${table.name}`}
      className={`aspect-square rounded-md bg-white p-1 [&_svg]:size-full ${className ?? ''}`}
      // The SVG comes from the qrcode library, built from our own URL.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/**
 * The table QR codes customers scan to order: see each one, open it large to download or print
 * it, download all of them at once, and replace a lost or copied one.
 */
export function QrStickers() {
  const codes = useTableCodes();
  const outlet = useOutlet();
  const restaurant = outlet.data?.name ?? '';
  const [open, setOpen] = useState<TableCode | null>(null);
  const [confirming, setConfirming] = useState<TableCode | null>(null);
  const [renewed, setRenewed] = useState<TableCode | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function attempt(verb: string, work: () => Promise<void>) {
    setProblem(null);
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setProblem(`Could not ${verb}: ${describeError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const print = (tables: TableCode[]) =>
    attempt('print', async () => {
      const html = await renderQrStickers(tables, restaurant, window.location.origin);
      await printHtmlInIframe(html);
    });

  const png = (t: TableCode) =>
    qrPng(stickerUrl(window.location.origin, t.qrToken), t.name, restaurant);

  const downloadOne = (t: TableCode) =>
    attempt('download', async () => saveBlob(await png(t), `${fileSafe(t.name)}-qr.png`));

  const downloadAll = (tables: TableCode[]) =>
    attempt('download', async () => {
      const files = [];
      for (const t of tables) {
        files.push({ name: `${fileSafe(`${t.areaName} ${t.name}`)}-qr.png`, blob: await png(t) });
      }
      saveBlob(await zipFiles(files), 'table-qr-codes.zip');
    });

  const rotate = useRotateTableCode((table) => {
    setConfirming(null);
    setOpen(null);
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<Download aria-hidden="true" />}
            disabled={tables.length === 0 || busy}
            onClick={() => void downloadAll(tables)}
          >
            Download all
          </Button>
          <Button
            variant="secondary"
            icon={<Printer aria-hidden="true" />}
            disabled={tables.length === 0 || busy}
            onClick={() => void print(tables)}
          >
            Print all stickers
          </Button>
        </div>
      </div>
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
      {!open && <ErrorNote message={problem} />}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {tables.map((t) => (
          <li
            key={t.id}
            className="flex flex-col items-center gap-2 rounded-lg border border-border p-3"
          >
            <QrImage table={t} className="w-full max-w-28" />
            <span className="text-center text-sm">
              <span className="block font-semibold">{t.name}</span>
              <span className="text-subtle">{t.areaName}</span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Open QR code for ${t.name}`}
              className="min-h-11 w-full"
              onClick={() => {
                setRenewed(null);
                setProblem(null);
                setOpen(t);
              }}
            >
              Open
            </Button>
          </li>
        ))}
      </ul>

      {open && (
        <Dialog
          label={`QR code for ${open.name}`}
          onClose={() => {
            setOpen(null);
            setConfirming(null);
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-lg font-semibold">{`${open.name} · ${open.areaName}`}</h2>
            <QrImage table={open} className="w-full max-w-64" />
            <p className="max-w-full text-center text-xs break-all text-muted">
              {stickerUrl(window.location.origin, open.qrToken)}
            </p>
            {confirming ? (
              <ConfirmBar
                question={`Replace the QR code for ${confirming.name}? The old sticker stops working at once.`}
                confirmLabel={`Yes, new code for ${confirming.name}`}
                onConfirm={() => rotate.mutate(confirming)}
                onCancel={() => setConfirming(null)}
                busy={rotate.isPending}
              />
            ) : (
              <div className="grid w-full gap-2 sm:grid-cols-3">
                <Button
                  icon={<Download aria-hidden="true" />}
                  disabled={busy}
                  onClick={() => void downloadOne(open)}
                >
                  Download PNG
                </Button>
                <Button
                  variant="secondary"
                  icon={<Printer aria-hidden="true" />}
                  disabled={busy}
                  onClick={() => void print([open])}
                >
                  Print sticker
                </Button>
                <Button
                  variant="secondary"
                  icon={<RefreshCw aria-hidden="true" />}
                  onClick={() => setConfirming(open)}
                >
                  Replace code
                </Button>
              </div>
            )}
            <ErrorNote message={rotate.isError ? describeError(rotate.error) : null} />
            <ErrorNote message={problem} />
          </div>
        </Dialog>
      )}
    </section>
  );
}
