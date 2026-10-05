import type { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

function serviceWith(queryRaw: jest.Mock): HealthService {
  return new HealthService({ $queryRaw: queryRaw } as unknown as PrismaService);
}

describe('HealthService', () => {
  it('reports ok when the database answers', async () => {
    const service = serviceWith(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    await expect(service.check()).resolves.toEqual({ status: 'ok', db: 'up' });
  });

  it('reports down when the query fails', async () => {
    const service = serviceWith(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(service.check()).resolves.toEqual({ status: 'error', db: 'down' });
  });

  it('reports down when the query hangs past the timeout', async () => {
    const service = serviceWith(jest.fn().mockReturnValue(new Promise(() => undefined)));
    const started = Date.now();
    await expect(service.check(50)).resolves.toEqual({ status: 'error', db: 'down' });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
