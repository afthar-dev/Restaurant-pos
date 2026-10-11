export { qrSvg } from '@/shared/lib/qrSvg';

const SIZE = 1024;
const PAD = 64;
const QR = SIZE - PAD * 2;
const TEXT_AREA = 180;

/**
 * A printable PNG of one table's code: the QR with the table name and the restaurant under it,
 * at 1024 px wide so it prints sharp on a sticker or a table tent.
 */
export async function qrPng(url: string, table: string, restaurant: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE + TEXT_AREA;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw images.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const code = document.createElement('canvas');
  const { default: QRCode } = await import('qrcode');
  await QRCode.toCanvas(code, url, { width: QR, margin: 0, errorCorrectionLevel: 'M' });
  ctx.drawImage(code, PAD, PAD, QR, QR);

  ctx.fillStyle = '#1c1917';
  ctx.textAlign = 'center';
  ctx.font = '600 72px Inter, system-ui, sans-serif';
  ctx.fillText(table, SIZE / 2, SIZE + 40);
  ctx.fillStyle = '#57534e';
  ctx.font = '400 40px Inter, system-ui, sans-serif';
  ctx.fillText(`${restaurant} · Scan to see the menu and order`, SIZE / 2, SIZE + 110);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not make the image.'))),
      'image/png',
    ),
  );
}

/** Many files in one ZIP, so "Download all" is a single download the browser will not block. */
export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  // PNGs are already compressed: store them as they are.
  return new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
}

/** Hands a file to the browser's download. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name safe on every system: "T<2>" becomes "T_2_". */
export const fileSafe = (name: string) => name.replace(/[^\w .-]/g, '_').trim();
