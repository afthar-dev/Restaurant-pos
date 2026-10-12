import { upiLink } from '@rpos/shared';
import { useEffect, useState } from 'react';
import { qrSvg } from '@/shared/lib/qrSvg';
import { rupees } from '@/shared/lib/money';

/**
 * The UPI QR for one amount. The customer scans it with any UPI app and the amount is filled
 * in. The QR library loads on first use, so it never weighs on the first screen.
 */
export function UpiQr({
  vpa,
  payee,
  amountPaise,
  note,
}: {
  vpa: string;
  payee: string;
  amountPaise: number;
  note: string;
}) {
  const link = upiLink({ vpa, payee, amountPaise, note });
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSvg(null);
    qrSvg(link)
      .then((markup) => {
        if (live) setSvg(markup);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [link]);

  return (
    <figure className="flex flex-col items-center gap-1">
      {svg ? (
        <div
          role="img"
          aria-label="UPI QR code"
          className="size-44 rounded-md bg-white p-1 [&>svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div aria-hidden="true" className="size-44 animate-pulse rounded-md bg-surface-2" />
      )}
      <figcaption className="text-lg font-semibold tabular-nums">{`Scan to pay ${rupees(amountPaise)}`}</figcaption>
    </figure>
  );
}
