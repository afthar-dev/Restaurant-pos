const MAX_SIDE = 1024;

/** The size that fits within `max` on its longest side, keeping the shape; never larger. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * A phone photo made small enough to upload quickly: longest side 1024 px (or `maxSide`), WebP (JPEG where the
 * browser cannot write WebP). Rejects with a plain message if the file is not a readable image.
 */
export async function shrinkPhoto(file: File, maxSide = MAX_SIDE): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // Phone photos carry their rotation in EXIF; older browsers ignore it unless asked.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Could not read this photo.');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not read this photo.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = await encode(canvas, 'image/webp', 0.8);
  if (webp && webp.type === 'image/webp' && webp.size > 0) return webp;
  const jpeg = await encode(canvas, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('Could not read this photo.');
  return jpeg;
}
