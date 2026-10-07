import { HttpStatus, Injectable } from '@nestjs/common';
import type { ExpenseCategory, Prisma } from '@prisma/client';
import type { ExpenseCategoryRequest } from '@rpos/shared';
import { ApiError } from '../common/api-error';
import { nameTaken, notFound, sameActiveName } from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** The system category that purchases book their expense under (spec §4.4.6). */
export const RAW_MATERIAL = 'Raw material';

const DEFAULTS = ['Gas', 'Salaries', 'Rent', 'Electricity', 'Repairs', 'Other'];

type Db = Pick<Prisma.TransactionClient, 'expenseCategory'>;

export const categoryView = (c: ExpenseCategory) => ({
  id: c.id,
  name: c.name,
  isSystem: c.isSystem,
  archivedAt: c.archivedAt,
});

const systemCategory = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'SYSTEM_CATEGORY',
    'Raw material is used by purchases and cannot be changed.',
  );

/**
 * Creates the default categories the first time an outlet uses expenses, and Raw material
 * whenever it is missing. Safe to call on every request.
 */
export async function ensureDefaultCategories(db: Db, outletId: string): Promise<void> {
  const raw = await db.expenseCategory.findFirst({ where: { outletId, isSystem: true } });
  if (raw) return;
  const any = await db.expenseCategory.count({ where: { outletId } });
  await db.expenseCategory.createMany({
    data: [
      { outletId, name: RAW_MATERIAL, isSystem: true },
      ...(any === 0 ? DEFAULTS.map((name) => ({ outletId, name })) : []),
    ],
    // Two first requests at once: the second inserts nothing.
    skipDuplicates: true,
  });
}

/** The Raw material category, created if needed. */
export async function rawMaterialCategory(db: Db, outletId: string): Promise<ExpenseCategory> {
  await ensureDefaultCategories(db, outletId);
  return db.expenseCategory.findFirstOrThrow({ where: { outletId, isSystem: true } });
}

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(outletId: string) {
    await ensureDefaultCategories(this.prisma, outletId);
    const rows = await this.prisma.expenseCategory.findMany({
      where: { outletId, archivedAt: null },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map(categoryView);
  }

  async create(actor: AuthUser, request: ExpenseCategoryRequest) {
    await ensureDefaultCategories(this.prisma, actor.outletId);
    await this.assertNameFree(actor.outletId, request.name);
    const row = await this.prisma.expenseCategory.create({
      data: { outletId: actor.outletId, name: request.name },
    });
    return categoryView(row);
  }

  async rename(actor: AuthUser, id: string, request: ExpenseCategoryRequest) {
    await this.findEditable(actor.outletId, id);
    await this.assertNameFree(actor.outletId, request.name, id);
    const row = await this.prisma.expenseCategory.update({
      where: { id },
      data: { name: request.name },
    });
    return categoryView(row);
  }

  async archive(actor: AuthUser, id: string) {
    await this.findEditable(actor.outletId, id);
    const row = await this.prisma.expenseCategory.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return categoryView(row);
  }

  private async findEditable(outletId: string, id: string) {
    const row = await this.prisma.expenseCategory.findFirst({
      where: { id, outletId, archivedAt: null },
    });
    if (!row) throw notFound('Expense category');
    if (row.isSystem) throw systemCategory();
    return row;
  }

  private async assertNameFree(outletId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.expenseCategory.findFirst({
      where: { outletId, ...sameActiveName(name, exceptId) },
    });
    if (clash) throw nameTaken();
  }
}
