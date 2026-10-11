/**
 * Any text as a QR code in SVG markup. The QR library loads on first use, so it stays out of
 * the staff app's first bundle (table stickers, the Settle panel and printed bills share this).
 */
export async function qrSvg(text: string): Promise<string> {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}
