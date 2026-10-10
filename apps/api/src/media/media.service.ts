import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { detectImageType, MAX_IMAGE_BYTES } from './media';
import { imageKey, MEDIA_STORAGE, type MediaStorage } from './storage';

type Tx = Prisma.TransactionClient;

/** A stored image another row points at (a dish photo, the restaurant logo). */
export interface StoredMedia {
  id: string;
  key: string;
}

/**
 * Images for dish photos and the logo. Keeps storage and database in step: the new object is
 * written first, the rows change in one transaction, a failed transaction removes the new
 * object again, and the replaced object is removed only after the rows commit.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /** The public URL: the R2 address, or the local /api/media path. */
  urlFor(key: string): string {
    return this.storage.publicUrl(key);
  }

  /**
   * Stores `bytes` as a new image and runs `link(tx, mediaId)` to point the owner at it, in the
   * same transaction that deletes the owner's previous media row. `current(tx)` must lock the
   * owner row and return its current media, so two uploads cannot both miss, or both delete,
   * the same old row. Returns the new media.
   */
  async replace({
    outletId,
    bytes,
    current,
    link,
  }: {
    outletId: string;
    bytes: Buffer | undefined;
    current: (tx: Tx) => Promise<StoredMedia | null>;
    link: (tx: Tx, mediaId: string) => Promise<unknown>;
  }): Promise<StoredMedia & { byteSize: number }> {
    if (bytes && bytes.length > MAX_IMAGE_BYTES) {
      throw new ApiError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'FILE_TOO_LARGE',
        'The photo is too big. Use one under 1 MB.',
      );
    }
    const mimeType = bytes ? detectImageType(bytes) : null;
    if (!bytes || !mimeType) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Use a JPEG, PNG or WebP photo.');
    }
    const key = imageKey(mimeType);
    await this.storage.put(key, bytes, mimeType);
    let committed: { id: string; old: StoredMedia | null };
    try {
      committed = await this.prisma.$transaction(async (tx) => {
        const old = await current(tx);
        const media = await tx.media.create({
          data: { outletId, key, mimeType, byteSize: bytes.length },
        });
        await link(tx, media.id);
        if (old) await tx.media.delete({ where: { id: old.id } });
        return { id: media.id, old };
      });
    } catch (error) {
      await this.discard(key);
      throw error;
    }
    if (committed.old) await this.discard(committed.old.key);
    return { id: committed.id, key, byteSize: bytes.length };
  }

  /**
   * Unlinks and deletes the owner's current media (read by `current(tx)`, which must lock the
   * owner row) in one transaction, then removes its object. Returns null when there was none.
   */
  async remove({
    current,
    unlink,
  }: {
    current: (tx: Tx) => Promise<StoredMedia | null>;
    unlink: (tx: Tx) => Promise<unknown>;
  }): Promise<StoredMedia | null> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const old = await current(tx);
      if (!old) return null;
      await unlink(tx);
      await tx.media.delete({ where: { id: old.id } });
      return old;
    });
    if (removed) await this.discard(removed.key);
    return removed;
  }

  /** Removes an object nobody points at any more; a failure is logged, never thrown. */
  async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`Could not delete image ${key}: ${String(error)}`);
    }
  }
}
