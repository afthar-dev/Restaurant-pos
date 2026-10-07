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

/** One dish in the cart; `unitPrice` includes add-ons. */
export interface CartLine {
  key: string;
  variantId: string;
  addonIds: string[];
  quantity: number;
  note?: string;
  label: string;
  unitPrice: number;
}

export interface Request {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  message: string;
  lines: {
    itemName: string;
    variantName: string;
    addons: string[];
    quantity: number;
    note: string | null;
    amount: number;
  }[];
  note: string | null;
  total: number;
  createdAt: string;
}
