import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed';

describe('seed', () => {
  const prisma = new PrismaClient();

  beforeEach(async () => {
    await prisma.outlet.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates exactly one outlet even when run twice', async () => {
    await seed(prisma);
    await seed(prisma);
    const outlets = await prisma.outlet.findMany();
    expect(outlets).toHaveLength(1);
    expect(outlets[0]?.name).toBe('Main Outlet');
    expect(outlets[0]?.taxScheme).toBe('REGULAR');
  });
});
