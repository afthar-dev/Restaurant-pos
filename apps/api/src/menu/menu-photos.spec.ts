import type { AuthUser } from '../common/request-context';
import { MenuService } from './menu.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const actor = { id: 'u1', outletId: 'o1' } as AuthUser;

describe('MenuService.setItemImage', () => {
  it('deletes the new photo again when the database step fails', async () => {
    const storage = {
      kind: 'local' as const,
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      publicUrl: (key: string) => key,
      read: jest.fn(),
    };
    const prisma = {
      item: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'i1', name: 'Tikka', imageId: null, image: null }),
      },
      $transaction: jest.fn().mockRejectedValue(new Error('database down')),
    };
    const service = new MenuService(
      prisma as never,
      { record: jest.fn() } as never,
      {} as never,
      storage,
    );

    await expect(service.setItemImage(actor, 'i1', JPEG)).rejects.toThrow('database down');
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
  });
});
