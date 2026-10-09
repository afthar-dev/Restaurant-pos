import type { FoodType } from '@rpos/shared';

export interface MenuVariant {
  id: string;
  name: string;
  dineInPrice: number;
  parcelPrice: number;
  packagingCharge: number;
}

export interface MenuAddon {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface MenuAddonGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  addons: MenuAddon[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  foodType: FoodType;
  isAvailable: boolean;
  isCombo: boolean;
  /** The dish photo for the QR menu, or null. */
  imageUrl: string | null;
  /** null: no GST, the price is charged as it is. */
  taxRate: { id: string; name: string; cgstBp: number; sgstBp: number } | null;
  variants: MenuVariant[];
  addonGroups: MenuAddonGroup[];
  components: { variantId: string; itemName: string; variantName: string; quantity: number }[];
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  station: { id: string; name: string };
  items: MenuItem[];
}

export interface Menu {
  categories: MenuCategory[];
}

export const FOOD_LABEL: Record<FoodType, string> = {
  VEG: 'Veg',
  NON_VEG: 'Non-veg',
  EGG: 'Egg',
};
