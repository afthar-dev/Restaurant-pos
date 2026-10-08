import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Category, ItemVariant, Prisma } from '@prisma/client';
import {
  applyPriceChange,
  MAX_PRICE_PAISE,
  type AddonGroupRequest,
  type BulkPriceRequest,
  type CategoryRequest,
  type ItemRequest,
} from '@rpos/shared';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import {
  inUse,
  invalidReference,
  nameTaken,
  notFound,
  sameActiveName,
} from '../common/master-data';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADDON_GROUP_INCLUDE,
  addonGroupView,
  ITEM_INCLUDE,
  itemView,
  type ItemView,
} from './menu.views';

type Tx = Prisma.TransactionClient;
type VariantPrices = Pick<ItemVariant, 'dineInPrice' | 'parcelPrice' | 'packagingCharge'>;

/** True when `ids` is exactly the set `active`, each once. */
const sameSet = (active: string[], ids: string[]) =>
  active.length === ids.length &&
  new Set(ids).size === ids.length &&
  ids.every((id) => active.includes(id));

const prices = (v: VariantPrices) => ({
  dineInPrice: v.dineInPrice,
  parcelPrice: v.parcelPrice,
  packagingCharge: v.packagingCharge,
});

const categoryView = (c: Category) => ({
  id: c.id,
  name: c.name,
  stationId: c.stationId,
  sortOrder: c.sortOrder,
  archivedAt: c.archivedAt,
});

/**
 * Categories, items (with variants, add-on links and combo components) and add-on groups.
 * Removed variants and add-ons are archived, never deleted: orders keep pointing at them.
 */
@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async menu(outletId: string) {
    const categories = await this.prisma.category.findMany({
      where: { outletId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        station: true,
        items: {
          where: { archivedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: ITEM_INCLUDE,
        },
      },
    });
    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        station: { id: c.station.id, name: c.station.name },
        items: c.items.map(itemView),
      })),
    };
  }

  // ---------- categories ----------

  async createCategory(actor: AuthUser, request: CategoryRequest) {
    await this.assertStation(actor.outletId, request.stationId);
    await this.assertCategoryNameFree(actor.outletId, request.name);
    const category = await this.prisma.category.create({
      data: {
        outletId: actor.outletId,
        stationId: request.stationId,
        name: request.name,
        sortOrder: request.sortOrder ?? (await this.nextCategoryOrder(actor.outletId)),
      },
    });
    await this.record(
      actor,
      'menu.category.create',
      'category',
      category.id,
      undefined,
      categoryView(category),
    );
    return categoryView(category);
  }

  async updateCategory(actor: AuthUser, id: string, request: CategoryRequest) {
    const current = await this.findCategory(actor.outletId, id);
    await this.assertStation(actor.outletId, request.stationId);
    await this.assertCategoryNameFree(actor.outletId, request.name, id);
    const category = await this.prisma.category.update({
      where: { id },
      data: {
        name: request.name,
        stationId: request.stationId,
        sortOrder: request.sortOrder ?? current.sortOrder,
      },
    });
    await this.record(
      actor,
      'menu.category.update',
      'category',
      id,
      categoryView(current),
      categoryView(category),
    );
    return categoryView(category);
  }

  async archiveCategory(actor: AuthUser, id: string) {
    const current = await this.findCategory(actor.outletId, id);
    const items = await this.prisma.item.count({ where: { categoryId: id, archivedAt: null } });
    if (items > 0) throw inUse('This category still has items. Move or archive them first.');
    const category = await this.prisma.category.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    await this.record(
      actor,
      'menu.category.archive',
      'category',
      id,
      categoryView(current),
      undefined,
    );
    return categoryView(category);
  }

  private async nextCategoryOrder(outletId: string) {
    const last = await this.prisma.category.aggregate({
      where: { outletId, archivedAt: null },
      _max: { sortOrder: true },
    });
    return (last._max.sortOrder ?? -1) + 1;
  }

  /** Saves the order of every active category: `ids` must be exactly those, each once. */
  async reorderCategories(actor: AuthUser, ids: string[]) {
    const active = await this.prisma.category.findMany({
      where: { outletId: actor.outletId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (
      !sameSet(
        active.map((c) => c.id),
        ids,
      )
    )
      throw invalidReference('ids');
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    const names = new Map(active.map((c) => [c.id, c.name]));
    await this.record(actor, 'menu.category.reorder', 'category', ids[0]!, undefined, {
      order: ids.map((id) => names.get(id)),
    });
    return { updated: ids.length };
  }

  /** Saves the order of every active dish in one category. */
  async reorderItems(actor: AuthUser, categoryId: string, ids: string[]) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, outletId: actor.outletId, archivedAt: null },
    });
    if (!category) throw notFound('Category');
    const active = await this.prisma.item.findMany({
      where: { categoryId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (
      !sameSet(
        active.map((i) => i.id),
        ids,
      )
    )
      throw invalidReference('ids');
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.item.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    const names = new Map(active.map((i) => [i.id, i.name]));
    await this.record(actor, 'menu.item.reorder', 'category', categoryId, undefined, {
      order: ids.map((id) => names.get(id)),
    });
    return { updated: ids.length };
  }

  /**
   * Changes the dine-in and parcel price of every size of the given dishes in one go. If any
   * price would fall below ₹0 or above the limit, nothing is saved.
   */
  async bulkPrices(actor: AuthUser, request: BulkPriceRequest) {
    const items = await this.prisma.item.findMany({
      where: { id: { in: request.itemIds }, outletId: actor.outletId, archivedAt: null },
      include: { variants: { where: { archivedAt: null }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (items.length !== request.itemIds.length) throw invalidReference('itemIds');

    const changes = items.flatMap((item) =>
      item.variants.map((variant) => ({
        item,
        variant,
        dineIn: applyPriceChange(variant.dineInPrice, request.change, request.roundTo),
        parcel: applyPriceChange(variant.parcelPrice, request.change, request.roundTo),
      })),
    );
    const bad = changes.find(
      (c) =>
        c.dineIn < 0 || c.parcel < 0 || c.dineIn > MAX_PRICE_PAISE || c.parcel > MAX_PRICE_PAISE,
    );
    if (bad) {
      const where = bad.dineIn < 0 || bad.parcel < 0 ? 'below ₹0' : 'above the highest price';
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION',
        `${bad.item.name} ${bad.variant.name} would go ${where}.`,
      );
    }

    await this.prisma.$transaction(
      changes.map((c) =>
        this.prisma.itemVariant.update({
          where: { id: c.variant.id },
          data: { dineInPrice: c.dineIn, parcelPrice: c.parcel },
        }),
      ),
    );
    await this.record(actor, 'menu.price.bulk', 'item', items[0]!.id, undefined, {
      change: request.change,
      roundTo: request.roundTo,
      prices: changes.map((c) => ({
        item: c.item.name,
        variant: c.variant.name,
        before: { dineIn: c.variant.dineInPrice, parcel: c.variant.parcelPrice },
        after: { dineIn: c.dineIn, parcel: c.parcel },
      })),
    });
    return { updated: changes.length };
  }

  // ---------- items ----------

  async createItem(actor: AuthUser, request: ItemRequest): Promise<ItemView> {
    await this.validateItemReferences(actor.outletId, request);
    await this.assertItemNameFree(request.categoryId, request.name);

    const id = await this.prisma.$transaction(async (tx) => {
      const last = await tx.item.aggregate({
        where: { categoryId: request.categoryId, archivedAt: null },
        _max: { sortOrder: true },
      });
      const item = await tx.item.create({
        data: {
          outletId: actor.outletId,
          categoryId: request.categoryId,
          taxRateId: request.taxRateId,
          name: request.name,
          description: request.description ?? null,
          foodType: request.foodType,
          isCombo: request.isCombo,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      await tx.itemVariant.createMany({
        data: request.variants.map((v, index) => ({
          itemId: item.id,
          name: v.name,
          dineInPrice: v.dineInPrice,
          parcelPrice: v.parcelPrice ?? v.dineInPrice,
          packagingCharge: v.packagingCharge ?? 0,
          sortOrder: index,
        })),
      });
      await this.replaceLinks(tx, item.id, request);
      return item.id;
    });

    await this.record(actor, 'menu.item.create', 'item', id, undefined, { name: request.name });
    return this.loadItem(id);
  }

  async updateItem(actor: AuthUser, id: string, request: ItemRequest): Promise<ItemView> {
    const current = await this.prisma.item.findFirst({
      where: { id, outletId: actor.outletId, archivedAt: null },
      include: { variants: { where: { archivedAt: null } } },
    });
    if (!current) throw notFound('Item');
    await this.validateItemReferences(actor.outletId, request, id);
    await this.assertItemNameFree(request.categoryId, request.name, id);

    const existing = new Map(current.variants.map((v) => [v.id, v]));
    for (const v of request.variants) {
      if (v.id && !existing.has(v.id)) throw invalidReference('variants');
    }
    const keep = new Set(request.variants.map((v) => v.id).filter(Boolean));

    // KOTs expand combos one level deep: an item inside an active combo cannot become a combo,
    // and a size an active combo uses cannot be removed.
    const usedInCombos = await this.prisma.comboComponent.findMany({
      where: { variant: { itemId: id }, comboItem: { archivedAt: null } },
      select: { variantId: true },
    });
    if (usedInCombos.length > 0 && request.isCombo) {
      throw inUse('A combo includes this item, so it cannot become a combo itself.');
    }
    if (usedInCombos.some((c) => !keep.has(c.variantId))) {
      throw inUse('A combo uses the size you removed. Edit the combo first.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id },
        data: {
          categoryId: request.categoryId,
          taxRateId: request.taxRateId,
          name: request.name,
          description: request.description ?? null,
          foodType: request.foodType,
          isCombo: request.isCombo,
        },
      });
      for (const [index, v] of request.variants.entries()) {
        const data = {
          name: v.name,
          dineInPrice: v.dineInPrice,
          parcelPrice: v.parcelPrice ?? v.dineInPrice,
          packagingCharge: v.packagingCharge ?? 0,
          sortOrder: index,
        };
        if (v.id) await tx.itemVariant.update({ where: { id: v.id }, data });
        else await tx.itemVariant.create({ data: { ...data, itemId: id } });
      }
      await tx.itemVariant.updateMany({
        where: { itemId: id, archivedAt: null, id: { notIn: [...keep] as string[] } },
        data: { archivedAt: new Date() },
      });
      await this.replaceLinks(tx, id, request);
    });

    const updated = await this.loadItem(id);
    await this.recordPriceChanges(actor, id, current.variants, updated.variants);
    return updated;
  }

  async archiveItem(actor: AuthUser, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, outletId: actor.outletId, archivedAt: null },
    });
    if (!item) throw notFound('Item');
    const combos = await this.prisma.comboComponent.count({
      where: { variant: { itemId: id }, comboItem: { archivedAt: null } },
    });
    if (combos > 0)
      throw inUse('A combo still includes this item. Edit or archive the combo first.');
    await this.prisma.item.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.record(actor, 'menu.item.archive', 'item', id, { name: item.name }, undefined);
    return { id, archived: true };
  }

  async setItemAvailability(outletId: string, id: string, isAvailable: boolean) {
    const item = await this.prisma.item.findFirst({ where: { id, outletId, archivedAt: null } });
    if (!item) throw notFound('Item');
    await this.prisma.item.update({ where: { id }, data: { isAvailable } });
    this.events.emit('menu.availability', { outletId, itemId: id, isAvailable });
    return { id, isAvailable };
  }

  // ---------- add-on groups ----------

  async addonGroups(outletId: string) {
    const groups = await this.prisma.addonGroup.findMany({
      where: { outletId, archivedAt: null },
      orderBy: { name: 'asc' },
      include: ADDON_GROUP_INCLUDE,
    });
    return groups.map(addonGroupView);
  }

  async createAddonGroup(actor: AuthUser, request: AddonGroupRequest) {
    await this.assertGroupNameFree(actor.outletId, request.name);
    const group = await this.prisma.addonGroup.create({
      data: {
        outletId: actor.outletId,
        name: request.name,
        minSelect: request.minSelect,
        maxSelect: request.maxSelect,
        addons: {
          create: request.addons.map((a, index) => ({
            name: a.name,
            price: a.price,
            sortOrder: index,
          })),
        },
      },
      include: ADDON_GROUP_INCLUDE,
    });
    await this.record(actor, 'menu.addons.create', 'addon_group', group.id, undefined, {
      name: group.name,
    });
    return addonGroupView(group);
  }

  async updateAddonGroup(actor: AuthUser, id: string, request: AddonGroupRequest) {
    const current = await this.prisma.addonGroup.findFirst({
      where: { id, outletId: actor.outletId, archivedAt: null },
      include: ADDON_GROUP_INCLUDE,
    });
    if (!current) throw notFound('Add-on group');
    await this.assertGroupNameFree(actor.outletId, request.name, id);
    const existing = new Map(current.addons.map((a) => [a.id, a]));
    for (const a of request.addons) {
      if (a.id && !existing.has(a.id)) throw invalidReference('addons');
    }
    const keep = request.addons.map((a) => a.id).filter((x): x is string => Boolean(x));

    await this.prisma.$transaction(async (tx) => {
      await tx.addonGroup.update({
        where: { id },
        data: { name: request.name, minSelect: request.minSelect, maxSelect: request.maxSelect },
      });
      for (const [index, a] of request.addons.entries()) {
        const data = { name: a.name, price: a.price, sortOrder: index };
        if (a.id) await tx.addon.update({ where: { id: a.id }, data });
        else await tx.addon.create({ data: { ...data, groupId: id } });
      }
      await tx.addon.updateMany({
        where: { groupId: id, archivedAt: null, id: { notIn: keep } },
        data: { archivedAt: new Date() },
      });
    });

    const updated = await this.prisma.addonGroup.findUniqueOrThrow({
      where: { id },
      include: ADDON_GROUP_INCLUDE,
    });
    const before: Record<string, { price: number }> = {};
    const after: Record<string, { price: number }> = {};
    for (const a of current.addons) {
      const now = updated.addons.find((u) => u.id === a.id);
      if (!now || now.price !== a.price) {
        before[a.name] = { price: a.price };
        if (now) after[now.name] = { price: now.price };
      }
    }
    if (Object.keys(before).length > 0) {
      await this.record(actor, 'menu.price', 'addon_group', id, before, after);
    }
    return addonGroupView(updated);
  }

  async archiveAddonGroup(actor: AuthUser, id: string) {
    const group = await this.prisma.addonGroup.findFirst({
      where: { id, outletId: actor.outletId, archivedAt: null },
    });
    if (!group) throw notFound('Add-on group');
    await this.prisma.addonGroup.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.record(
      actor,
      'menu.addons.archive',
      'addon_group',
      id,
      { name: group.name },
      undefined,
    );
    return { id, archived: true };
  }

  async setAddonAvailability(outletId: string, id: string, isAvailable: boolean) {
    const addon = await this.prisma.addon.findFirst({
      where: { id, archivedAt: null, group: { outletId, archivedAt: null } },
    });
    if (!addon) throw notFound('Add-on');
    await this.prisma.addon.update({ where: { id }, data: { isAvailable } });
    this.events.emit('menu.availability', { outletId, addonId: id, isAvailable });
    return { id, isAvailable };
  }

  // ---------- helpers ----------

  private loadItem(id: string): Promise<ItemView> {
    return this.prisma.item
      .findUniqueOrThrow({ where: { id }, include: ITEM_INCLUDE })
      .then(itemView);
  }

  private async replaceLinks(tx: Tx, itemId: string, request: ItemRequest) {
    await tx.itemAddonGroup.deleteMany({ where: { itemId } });
    if (request.addonGroupIds.length > 0) {
      await tx.itemAddonGroup.createMany({
        data: [...new Set(request.addonGroupIds)].map((groupId, index) => ({
          itemId,
          groupId,
          sortOrder: index,
        })),
      });
    }
    await tx.comboComponent.deleteMany({ where: { comboItemId: itemId } });
    if (request.isCombo) {
      await tx.comboComponent.createMany({
        data: request.components.map((c) => ({
          comboItemId: itemId,
          variantId: c.variantId,
          quantity: c.quantity,
        })),
      });
    }
  }

  /** Every referenced row must be active and belong to the caller's outlet. */
  private async validateItemReferences(outletId: string, request: ItemRequest, selfId?: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: request.categoryId, outletId, archivedAt: null },
    });
    if (!category) throw invalidReference('categoryId');

    const tax = await this.prisma.taxRate.findFirst({
      where: { id: request.taxRateId, outletId, archivedAt: null },
    });
    if (!tax) throw invalidReference('taxRateId');

    const groupIds = [...new Set(request.addonGroupIds)];
    if (groupIds.length > 0) {
      const groups = await this.prisma.addonGroup.count({
        where: { id: { in: groupIds }, outletId, archivedAt: null },
      });
      if (groups !== groupIds.length) throw invalidReference('addonGroupIds');
    }

    if (request.isCombo) {
      const variantIds = [...new Set(request.components.map((c) => c.variantId))];
      const variants = await this.prisma.itemVariant.findMany({
        where: { id: { in: variantIds }, archivedAt: null },
        include: { item: true },
      });
      const valid =
        variants.length === variantIds.length &&
        variants.every(
          (v) =>
            v.item.outletId === outletId &&
            !v.item.archivedAt &&
            !v.item.isCombo &&
            v.itemId !== selfId,
        );
      if (!valid) throw invalidReference('components');
    }
  }

  private async recordPriceChanges(
    actor: AuthUser,
    itemId: string,
    before: ItemVariant[],
    after: ItemView['variants'],
  ) {
    const was: Record<string, ReturnType<typeof prices>> = {};
    const now: Record<string, ReturnType<typeof prices>> = {};
    for (const old of before) {
      const next = after.find((v) => v.id === old.id);
      const changed =
        !next ||
        next.dineInPrice !== old.dineInPrice ||
        next.parcelPrice !== old.parcelPrice ||
        next.packagingCharge !== old.packagingCharge;
      if (changed) {
        was[old.name] = prices(old);
        if (next) now[next.name] = prices(next);
      }
    }
    for (const v of after) {
      if (!before.some((old) => old.id === v.id)) now[v.name] = prices(v);
    }
    if (Object.keys(was).length > 0 || Object.keys(now).length > 0) {
      await this.record(actor, 'menu.price', 'item', itemId, was, now);
    }
  }

  private async findCategory(outletId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({ where: { id, outletId } });
    if (!category) throw notFound('Category');
    return category;
  }

  private async assertStation(outletId: string, stationId: string) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, outletId, archivedAt: null },
    });
    if (!station) throw invalidReference('stationId');
  }

  private async assertCategoryNameFree(outletId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.category.findFirst({
      where: { outletId, ...sameActiveName(name, exceptId) },
    });
    if (clash) throw nameTaken();
  }

  private async assertItemNameFree(categoryId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.item.findFirst({
      where: { categoryId, ...sameActiveName(name, exceptId) },
    });
    if (clash) throw nameTaken();
  }

  private async assertGroupNameFree(outletId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.addonGroup.findFirst({
      where: { outletId, ...sameActiveName(name, exceptId) },
    });
    if (clash) throw nameTaken();
  }

  private record(
    actor: AuthUser,
    action: string,
    entity: string,
    id: string,
    before?: object,
    after?: object,
  ) {
    return this.audit.record({
      outletId: actor.outletId,
      actorId: actor.id,
      action,
      entity,
      entityId: id,
      before: before as never,
      after: after as never,
    });
  }
}
