import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Env } from '../config/env';
import type { ImageType } from './media';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

/** Photos are written once under a new key and never changed, so they can be cached for a year. */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** Where photo files live: Cloudflare R2 in production, a local folder otherwise. */
export interface MediaStorage {
  readonly kind: 'r2' | 'local';
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
  /** The file's bytes when this storage serves them itself (local); null otherwise. */
  read(key: string): Promise<Buffer | null>;
}

const EXTENSION: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Keys look like "<uuid>.webp": random, flat, safe as a file name and a URL. */
export const KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const imageKey = (type: ImageType) => `${randomUUID()}.${EXTENSION[type]}`;

/** Cloudflare R2 through its S3-compatible API; photos load from the bucket's public URL. */
export class R2Storage implements MediaStorage {
  readonly kind = 'r2';

  constructor(
    private readonly client: Pick<S3Client, 'send'>,
    private readonly bucket: string,
    private readonly baseUrl: string,
  ) {}

  async put(key: string, bytes: Buffer, mimeType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType,
        CacheControl: IMMUTABLE_CACHE,
      }),
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string) {
    return `${this.baseUrl}/${key}`;
  }

  read(_key: string): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
}

/** A folder on the server, served by GET /api/media/:key. */
export class LocalStorage implements MediaStorage {
  readonly kind = 'local';

  constructor(private readonly dir: string) {}

  async put(key: string, bytes: Buffer, _mimeType: string) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, key), bytes);
  }

  async delete(key: string) {
    await rm(join(this.dir, key), { force: true });
  }

  publicUrl(key: string) {
    return `/api/media/${key}`;
  }

  async read(key: string) {
    try {
      return await readFile(join(this.dir, key));
    } catch {
      return null;
    }
  }
}

export function createMediaStorage(env: Pick<Env, 'R2' | 'MEDIA_DIR'>): MediaStorage {
  if (!env.R2) return new LocalStorage(resolve(env.MEDIA_DIR));
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2.accessKeyId,
      secretAccessKey: env.R2.secretAccessKey,
    },
  });
  return new R2Storage(client, env.R2.bucket, env.R2.publicUrl);
}
