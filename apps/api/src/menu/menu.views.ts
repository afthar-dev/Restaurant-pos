import type { Prisma } from '@prisma/client';

/** Everything the POS, captain app and admin need to show and price one item. */
export const ITEM_INCLUDE = {
  taxRate: true,
  variants: {
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  addonGroups: {
    where: { group: { archivedAt: null } },
    orderBy: { sortOrder: 'asc' },
    include: {
      group: {
        include: {
          addons: {
            where: { archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
  },
  components: { include: { variant: { include: { item: true } } } },
} satisfies Prisma.ItemInclude;

export type ItemWithDetails = Prisma.ItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

export const ADDON_GROUP_INCLUDE = {
  addons: { where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.AddonGroupInclude;

export type AddonGroupWithAddons = Prisma.AddonGroupGetPayload<{
  include: typeof ADDON_GROUP_INCLUDE;
}>;

export function addonGroupView(group: AddonGroupWithAddons) {
  return {
    id: group.id,
    name: group.name,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    addons: group.addons.map((a) => ({
      id: a.id,
      name: a.name,
      price: a.price,
      isAvailable: a.isAvailable,
    })),
  };
}

export function itemView(item: ItemWithDetails) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    foodType: item.foodType,
    isAvailable: item.isAvailable,
    isCombo: item.isCombo,
    taxRate: {
      id: item.taxRate.id,
      name: item.taxRate.name,
      cgstBp: item.taxRate.cgstBp,
      sgstBp: item.taxRate.sgstBp,
    },
    variants: item.variants.map((v) => ({
      id: v.id,
      name: v.name,
      dineInPrice: v.dineInPrice,
      parcelPrice: v.parcelPrice,
      packagingCharge: v.packagingCharge,
    })),
    addonGroups: item.addonGroups.map((link) => addonGroupView(link.group)),
    components: item.components.map((c) => ({
      variantId: c.variantId,
      itemName: c.variant.item.name,
      variantName: c.variant.name,
      quantity: c.quantity,
    })),
  };
}

export type ItemView = ReturnType<typeof itemView>;
