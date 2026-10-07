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
