import { PrismaClient } from '@prisma/client';

/** Ensures the single outlet exists. Safe to run any number of times. */
export async function seed(prisma: PrismaClient): Promise<void> {
  const count = await prisma.outlet.count();
  if (count === 0) {
    await prisma.outlet.create({ data: { name: 'Main Outlet' } });
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (error: unknown) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
