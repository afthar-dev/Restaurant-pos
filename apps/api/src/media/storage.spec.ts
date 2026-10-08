import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorage, R2Storage, imageKey } from './storage';

describe('R2Storage', () => {
  it('puts photos in the bucket with their type and long caching', async () => {
    const send = jest.fn().mockResolvedValue({});
    const storage = new R2Storage({ send }, 'menu-photos', 'https://photos.example.in');
    await storage.put('abc.webp', Buffer.from('x'), 'image/webp');
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'menu-photos',
      Key: 'abc.webp',
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('deletes from the bucket and builds public URLs', async () => {
    const send = jest.fn().mockResolvedValue({});
    const storage = new R2Storage({ send }, 'menu-photos', 'https://photos.example.in');
    await storage.delete('abc.webp');
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect((send.mock.calls[0][0] as DeleteObjectCommand).input).toEqual({
      Bucket: 'menu-photos',
      Key: 'abc.webp',
    });
    expect(storage.publicUrl('abc.webp')).toBe('https://photos.example.in/abc.webp');
    expect(await storage.read('abc.webp')).toBeNull();
  });
});

describe('LocalStorage', () => {
  it('writes, reads and deletes files in its folder, served under /api/media', async () => {
    const storage = new LocalStorage(join(mkdtempSync(join(tmpdir(), 'rpos-')), 'nested'));
    await storage.put('abc.png', Buffer.from('png'), 'image/png');
    expect((await storage.read('abc.png'))?.toString()).toBe('png');
    expect(storage.publicUrl('abc.png')).toBe('/api/media/abc.png');
    await storage.delete('abc.png');
    expect(await storage.read('abc.png')).toBeNull();
    await expect(storage.delete('abc.png')).resolves.toBeUndefined();
  });
});

describe('imageKey', () => {
  it('names a new object by a random id and the type', () => {
    expect(imageKey('image/jpeg')).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(imageKey('image/png')).toMatch(/\.png$/);
    expect(imageKey('image/webp')).toMatch(/\.webp$/);
  });
});
