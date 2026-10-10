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
 * A phone photo made small enough to upload quickly: longest side 1024 px (or `maxSide`),
 * WebP. Where the browser cannot write WebP: JPEG on white, or PNG with `transparent` (logos).
 * Rejects with a plain message if the file is not a readable image.
 */
export async function shrinkPhoto(
  file: File,
  maxSide = MAX_SIDE,
  { transparent = false }: { transparent?: boolean } = {},
): Promise<Blob> {
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
  // No WebP encoder (Safari, iPad). A logo keeps its transparency as PNG; a photo becomes a
  // JPEG, which has no transparency, so it goes on white first (clear pixels would turn black).
  if (transparent) {
    const png = await encode(canvas, 'image/png', 1);
    if (!png) throw new Error('Could not read this photo.');
    return png;
  }
  const flat = document.createElement('canvas');
  flat.width = width;
  flat.height = height;
  const flatContext = flat.getContext('2d');
  if (!flatContext) throw new Error('Could not read this photo.');
  flatContext.fillStyle = '#ffffff';
  flatContext.fillRect(0, 0, width, height);
  flatContext.drawImage(canvas, 0, 0);
  const jpeg = await encode(flat, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('Could not read this photo.');
  return jpeg;
}
