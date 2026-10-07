import { formatQuantity, type PaymentMode, type StockUnit } from '@rpos/shared';

/** Mirrors stockItemView() in apps/api/src/stock/stock.views.ts. Quantities in thousandths. */
export interface StockItem {
  id: string;
  name: string;
  unit: StockUnit;
  minLevelMilli: number;
  currentMilli: number;
  /** At or below its minimum level (when one is set). */
  low: boolean;
  /** `rate` is paise per whole unit. */
  lastPurchase: { date: string; rate: number } | null;
}

export interface StockTxn {
  id: string;
  type: 'PURCHASE' | 'PURCHASE_VOID' | 'ADJUST' | 'COUNT';
  qtyMilli: number;
  amount: number | null;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
}

export interface PurchaseLine {
  id: string;
  stockItemId: string;
  itemName: string;
  unit: StockUnit;
  qtyMilli: number;
  amount: number;
}

export interface Purchase {
  id: string;
  vendorName: string;
  billRef: string | null;
  paidMode: PaymentMode;
  total: number;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
  voidedAt: string | null;
  voidedBy: { id: string; name: string } | null;
  voidReason: string | null;
  lines: PurchaseLine[];
}

export interface StockItemInput {
  name: string;
  unit: StockUnit;
  minLevelMilli: number;
}

export interface NewPurchase {
  vendorName: string;
  billRef?: string;
  paidMode: PaymentMode;
  note?: string;
  lines: { stockItemId: string; qtyMilli: number; amount: number }[];
}

/** "2.5 kg". */
export const quantityLabel = (milli: number, unit: string) => `${formatQuantity(milli)} ${unit}`;

export const TXN_LABEL: Record<StockTxn['type'], string> = {
  PURCHASE: 'Purchase',
  PURCHASE_VOID: 'Purchase voided',
  ADJUST: 'Adjustment',
  COUNT: 'Count',
};
