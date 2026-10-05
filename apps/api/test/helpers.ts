import type { PrismaClient } from '@prisma/client';

/** Empties every table, children first. Keep in sync with prisma/schema.prisma. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_entries, refresh_sessions, devices, users, outlets RESTART IDENTITY CASCADE',
  );
}
