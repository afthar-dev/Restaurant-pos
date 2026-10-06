import type {
  BillStatus,
  PaymentMode,
  KotStatus,
  KotType,
  OrderItemStatus,
  OrderStatus,
  OrderType,
} from '@rpos/shared';

export interface BusinessDay {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openingCash: number;
  openedAt: string;
  openedBy: { id: string; name: string };
}

export interface FloorTableStatus {
  id: string;
  name: string;
  seats: number;
  order: {
    orderId: string;
    status: OrderStatus;
    guests: number | null;
    itemCount: number;
    subtotal: number;
    openedAt: string;
    /** Set when this table was merged into the order of another table (its name). */
    mergedInto?: string;
  } | null;
}

export interface FloorAreaStatus {
  id: string;
  name: string;
  sortOrder: number;
  tables: FloorTableStatus[];
}

export interface ActiveOrder {
  id: string;
  type: OrderType;
  status: OrderStatus;
  tableId: string | null;
  tableName: string | null;
  tokenNo: number | null;
  customerName: string | null;
  guests: number | null;
  itemCount: number;
  subtotal: number;
  createdAt: string;
}

export interface OrderLine {
  id: string;
  itemId: string;
  variantId: string;
  itemName: string;
  variantName: string;
  unitPrice: number;
  packagingCharge: number;
  quantity: number;
  addons: { id: string; name: string; price: number }[];
  comboComponents: { itemName: string; variantName: string; quantity: number }[];
  note: string | null;
  status: OrderItemStatus;
  kotId: string | null;
  cancelReason: string | null;
  stationId: string;
  createdAt: string;
  lineTotal: number;
  /** Quantity already on a non-void bill. */
  billedQuantity: number;
}

/** Whether the KOT reached paper: NONE when no printer covers its station. */
export type KotPrintState = 'NONE' | 'WAITING' | 'PRINTED' | 'FAILED';

export interface OrderKot {
  id: string;
  kotNo: number;
  type: KotType;
  status: KotStatus;
  stationId: string;
  stationName: string;
  createdAt: string;
  print: KotPrintState;
}

export interface OrderBillSummary {
  id: string;
  billNo: number;
  status: BillStatus;
  total: number;
  paid: number;
}

export interface Order {
  id: string;
  type: OrderType;
  source: 'POS' | 'CAPTAIN' | 'QR';
  status: OrderStatus;
  table: { id: string; name: string } | null;
  tokenNo: number | null;
  guests: number | null;
  customerName: string | null;
  waiter: { id: string; name: string } | null;
  version: number;
  cancelReason: string | null;
  createdAt: string;
  items: OrderLine[];
  kots: OrderKot[];
  bills: OrderBillSummary[];
  mergedTables: { id: string; name: string }[];
  subtotal: number;
}

export interface KdsTicket {
  id: string;
  orderId: string;
  kotNo: number;
  type: KotType;
  status: KotStatus;
  stationId: string;
  stationName: string;
  orderType: OrderType;
  tableName: string | null;
  tokenNo: number | null;
  guests: number | null;
  waiterName: string;
  createdAt: string;
  lines: {
    id: string;
    itemName: string;
    variantName: string;
    quantity: number;
    addons: string[];
    comboComponents: { itemName: string; variantName: string; quantity: number }[];
    note: string | null;
  }[];
}

/** "T4" or "Parcel #12". */
export function orderLabel(order: {
  table?: { name: string } | null;
  tableName?: string | null;
  tokenNo: number | null;
}) {
  const table = order.table?.name ?? order.tableName;
  return table ? table : `Parcel #${order.tokenNo ?? '?'}`;
}

export interface Discount {
  kind: 'FLAT' | 'PERCENT';
  /** FLAT: paise. PERCENT: basis points. */
  value: number;
}

export interface BillLine {
  id: string;
  orderItemId: string;
  itemName: string;
  variantName: string;
  addons: { name: string; price: number }[];
  /** Per unit, add-ons included. */
  unitPrice: number;
  quantity: number;
  gross: number;
  discount: Discount | null;
  itemDiscount: number;
  lineTotal: number;
}

export interface BillPayment {
  id: string;
  mode: PaymentMode;
  amount: number;
  tendered: number | null;
  change: number | null;
  reference: string | null;
  receivedBy: { id: string; name: string };
  createdAt: string;
}

export interface TaxRow {
  cgstBp: number;
  sgstBp: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

/** Mirrors billView() in apps/api/src/billing/bill.views.ts. */
export interface Bill {
  id: string;
  billNo: number;
  financialYear: string;
  status: BillStatus;
  title: 'Tax Invoice' | 'Bill of Supply';
  orderId: string;
  orderType: OrderType;
  tableName: string | null;
  tokenNo: number | null;
  lines: BillLine[];
  grossSubtotal: number;
  itemDiscount: number;
  subtotal: number;
  discount: Discount | null;
  billDiscount: number;
  discountReason: string | null;
  packaging: number;
  taxable: number;
  cgst: number;
  sgst: number;
  taxBreakup: TaxRow[];
  roundOff: number;
  total: number;
  paid: number;
  due: number;
  payments: BillPayment[];
  voidReason: string | null;
  version: number;
  createdAt: string;
  createdBy: { id: string; name: string };
}
