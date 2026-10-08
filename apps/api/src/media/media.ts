export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Largest photo we keep: the browser shrinks photos well below this. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

const startsWith = (bytes: Buffer, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

/** The image type from the file's own first bytes; null for anything we do not store. */
export function detectImageType(bytes: Buffer): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  return null;
}
