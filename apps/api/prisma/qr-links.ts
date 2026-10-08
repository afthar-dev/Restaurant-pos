/**
 * Prints each table's customer-menu link for testing the QR app on this computer, since the
 * printed stickers point at the production address.
 *
 * Run: pnpm --filter @rpos/api db:qr-links   (with the qr dev server on port 5174)
 */
import { PrismaClient } from '@prisma/client';

const QR_DEV_ORIGIN = 'http://localhost:5174';

async function main() {
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.diningTable.findMany({
      where: { archivedAt: null, area: { archivedAt: null } },
      include: { area: { select: { name: true, sortOrder: true } } },
      orderBy: [{ area: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
    if (tables.length === 0) console.log('No tables yet. Add some under Admin → Tables.');
    for (const t of tables) {
      console.log(
        `${t.area.name} ${t.name}: ${QR_DEV_ORIGIN}/qr/?t=${encodeURIComponent(t.qrToken)}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
