import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { nameSchema, passwordSchema, phoneSchema } from '@rpos/shared';

type SeedEnv = Record<string, string | undefined>;

/**
 * Ensures the single outlet exists and, when OWNER_PHONE and OWNER_PASSWORD are set,
 * that an owner account exists. Safe to run any number of times.
 */
export async function seed(prisma: PrismaClient, env: SeedEnv): Promise<void> {
  const outlet =
    (await prisma.outlet.findFirst({ orderBy: { createdAt: 'asc' } })) ??
    (await prisma.outlet.create({ data: { name: 'Main Outlet' } }));

  if (!env.OWNER_PHONE && !env.OWNER_PASSWORD) return;

  const phone = phoneSchema.safeParse(env.OWNER_PHONE);
  if (!phone.success) throw new Error('OWNER_PHONE must be a 10-digit mobile number');
  const password = passwordSchema.safeParse(env.OWNER_PASSWORD);
  if (!password.success) throw new Error('OWNER_PASSWORD must be at least 8 characters');
  const name = nameSchema.safeParse(env.OWNER_NAME ?? 'Owner');
  if (!name.success) throw new Error('OWNER_NAME is invalid');

  const existingOwner = await prisma.user.findFirst({
    where: { outletId: outlet.id, role: 'OWNER', archivedAt: null },
  });
  if (existingOwner) return;

  await prisma.user.create({
    data: {
      outletId: outlet.id,
      name: name.data,
      phone: phone.data,
      role: 'OWNER',
      passwordHash: await hash(password.data),
    },
  });
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seed(prisma, process.env)
    .then(() => prisma.$disconnect())
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
