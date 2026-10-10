import { MediaService } from './media.service';
import type { MediaStorage } from './storage';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(50),
]);

function setup(transactionFails = false) {
  const files = new Map<string, Buffer>();
  const storage: MediaStorage = {
    put: jest.fn(async (key: string, bytes: Buffer) => {
      files.set(key, bytes);
    }),
    delete: jest.fn(async (key: string) => {
      files.delete(key);
    }),
    publicUrl: (key: string) => `/api/media/${key}`,
  } as unknown as MediaStorage;
  const tx = {
    media: {
      create: jest.fn(async () => ({ id: 'm-new' })),
      delete: jest.fn(async () => undefined),
    },
  };
  const prisma = {
    $transaction: jest.fn(async <T>(work: (t: typeof tx) => Promise<T>) => {
      if (transactionFails) throw new Error('database down');
      return work(tx);
    }),
  };
  const service = new MediaService(prisma as never, storage);
  return { service, storage, files, tx };
}

describe('MediaService', () => {
  it('stores the file, links it, then drops the old file', async () => {
    const { service, files, tx } = setup();
    files.set('old.png', Buffer.from('old'));
    const link = jest.fn(async () => undefined);
    const media = await service.replace({
      outletId: 'o1',
      bytes: PNG,
      current: async () => ({ id: 'm-old', key: 'old.png' }),
      link,
    });
    expect(link).toHaveBeenCalledWith(tx, 'm-new');
    expect(tx.media.delete).toHaveBeenCalledWith({ where: { id: 'm-old' } });
    expect(files.has('old.png')).toBe(false);
    expect(files.has(media.key)).toBe(true);
    expect(media.byteSize).toBe(PNG.length);
  });

  it('removes the current media, and does nothing when there is none', async () => {
    const { service, files, tx } = setup();
    files.set('old.png', Buffer.from('old'));
    const unlink = jest.fn(async () => undefined);
    const removed = await service.remove({
      current: async () => ({ id: 'm-old', key: 'old.png' }),
      unlink,
    });
    expect(removed).toEqual({ id: 'm-old', key: 'old.png' });
    expect(unlink).toHaveBeenCalledWith(tx);
    expect(tx.media.delete).toHaveBeenCalledWith({ where: { id: 'm-old' } });
    expect(files.has('old.png')).toBe(false);

    unlink.mockClear();
    tx.media.delete.mockClear();
    expect(await service.remove({ current: async () => null, unlink })).toBeNull();
    expect(unlink).not.toHaveBeenCalled();
    expect(tx.media.delete).not.toHaveBeenCalled();
  });

  it('removes the new file again when the database part fails', async () => {
    const { service, files } = setup(true);
    await expect(
      service.replace({
        outletId: 'o1',
        bytes: PNG,
        current: async () => null,
        link: async () => undefined,
      }),
    ).rejects.toThrow('database down');
    expect(files.size).toBe(0);
  });

  it('refuses files that are not images, and ones over 1 MB', async () => {
    const { service } = setup();
    await expect(
      service.replace({
        outletId: 'o1',
        bytes: Buffer.from('hello'),
        current: async () => null,
        link: async () => undefined,
      }),
    ).rejects.toThrow('Use a JPEG, PNG or WebP photo.');
    const big = Buffer.concat([PNG, Buffer.alloc(1_100_000)]);
    const tooBig = service.replace({
      outletId: 'o1',
      bytes: big,
      current: async () => null,
      link: async () => undefined,
    });
    await expect(tooBig).rejects.toThrow('The photo is too big. Use one under 1 MB.');
    await expect(tooBig).rejects.toMatchObject({ status: 413 });
  });

  it('never throws when a leftover file cannot be deleted', async () => {
    const { service, storage } = setup();
    (storage.delete as jest.Mock).mockRejectedValueOnce(new Error('R2 down'));
    await expect(service.discard('gone.png')).resolves.toBeUndefined();
  });
});
