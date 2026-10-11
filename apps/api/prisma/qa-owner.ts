/**
 * Dev only: adds a second owner, "QA Owner", for checking owner-only screens without the real
 * owner's password. Prints nothing secret; the password is written to the file given as the
 * first argument. Run: pnpm --filter @rpos/api exec tsx prisma/qa-owner.ts <out-file>
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const PHONE = '9000000099';

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('Give a file to write the login to');
  const prisma = new PrismaClient();
  const outlet = await prisma.outlet.findFirstOrThrow();
  const password = `qa-${randomBytes(9).toString('base64url')}`;
  const passwordHash = await hash(password);
  const existing = await prisma.user.findFirst({ where: { phone: PHONE } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, archivedAt: null },
    });
  } else {
    await prisma.user.create({
      data: { outletId: outlet.id, name: 'QA Owner', phone: PHONE, role: 'OWNER', passwordHash },
    });
  }
  writeFileSync(out, `QA Owner (dev only)\nphone: ${PHONE}\npassword: ${password}\n`);
  await prisma.$disconnect();
  console.log(`QA Owner ready; login written to ${out}`);
}

void main();
