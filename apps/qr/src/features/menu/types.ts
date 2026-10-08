export interface MenuAddon {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  foodType: 'VEG' | 'NON_VEG' | 'EGG';
  /** The dish photo (Cloudflare R2 or the restaurant server), or null. */
  imageUrl: string | null;
  variants: { id: string; name: string; price: number }[];
  addonGroups: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    addons: MenuAddon[];
  }[];
}

export interface Menu {
  categories: { id: string; name: string; items: MenuItem[] }[];
}
