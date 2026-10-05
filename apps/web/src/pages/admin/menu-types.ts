import { paiseToRupeesInput, type FoodType } from '@rpos/shared';

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
  taxRate: { id: string; name: string; cgstBp: number; sgstBp: number };
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

export const menuKey = ['menu'];
export const addonGroupsKey = ['addon-groups'];

/** Short price for lists: 9000 → "₹90", 22050 → "₹220.50". */
export function rupees(paise: number): string {
  return `₹${paiseToRupeesInput(paise)}`;
}

export const FOOD_LABEL: Record<FoodType, string> = {
  VEG: 'Veg',
  NON_VEG: 'Non-veg',
  EGG: 'Egg',
};

/** Green / red / amber dot, as on Indian menus. */
export const FOOD_DOT: Record<FoodType, string> = {
  VEG: 'bg-green-600',
  NON_VEG: 'bg-red-700',
  EGG: 'bg-amber-500',
};
